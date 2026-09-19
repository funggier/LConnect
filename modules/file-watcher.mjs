import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { z } from "zod";

const watchers = new Map();
let watcherCounter = 0;

function textResult(value, isError = false) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

function normalizeCompare(value) {
  const resolved = path.resolve(value).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isWithin(candidate, root) {
  const c = normalizeCompare(candidate);
  const r = normalizeCompare(root);
  return c === r || c.startsWith(r + path.sep.toLowerCase());
}

function resolveAllowed(inputPath, config) {
  if (!inputPath || typeof inputPath !== "string") throw new Error("A path is required.");
  const resolved = path.resolve(inputPath);
  if (config.fullMachineAccess) return resolved;
  if (!config.allowedDirectories.some((root) => isWithin(resolved, root))) {
    throw new Error(`Access denied - path outside allowed directories: ${resolved}`);
  }
  return resolved;
}

function psLiteral(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function snapshot(session) {
  return {
    watcher_id: session.id,
    path: session.path,
    kind: session.kind,
    recursive: session.recursive,
    backend: session.backend,
    running: !session.stopped,
    started_at: session.startedAt,
    next_seq: session.nextSeq,
    dropped_through_seq: session.droppedThroughSeq,
    buffered_event_count: session.events.length,
    max_buffer_events: session.maxBufferEvents,
    last_error: session.lastError,
    backend_pid: session.child?.pid ?? null,
    note: "Filesystem notifications may be coalesced or omitted by the operating system and are not a lossless audit log.",
  };
}

function addEvent(session, event) {
  const full = {
    seq: session.nextSeq++,
    timestamp: new Date().toISOString(),
    ...event,
  };
  session.events.push(full);
  while (session.events.length > session.maxBufferEvents) {
    const dropped = session.events.shift();
    session.droppedThroughSeq = dropped.seq;
  }
  return full;
}

function windowsWatcherScript(session) {
  const watchDirectory = session.kind === "file" ? path.dirname(session.path) : session.path;
  const filter = session.kind === "file" ? path.basename(session.path) : "*";

  return [
    "$ErrorActionPreference = 'Stop'",
    "$watcher = New-Object System.IO.FileSystemWatcher",
    `$watcher.Path = ${psLiteral(watchDirectory)}`,
    `$watcher.Filter = ${psLiteral(filter)}`,
    `$watcher.IncludeSubdirectories = ${session.recursive ? "$true" : "$false"}`,
    "$watcher.NotifyFilter = [System.IO.NotifyFilters]'FileName, DirectoryName, LastWrite, Size, CreationTime'",
    "$watcher.EnableRaisingEvents = $true",
    "$readyJson = [pscustomobject]@{ type = 'ready' } | ConvertTo-Json -Compress",
    "[Console]::Out.WriteLine($readyJson)",
    "[Console]::Out.Flush()",
    "try {",
    "  while ($true) {",
    "    $r = $watcher.WaitForChanged([System.IO.WatcherChangeTypes]::All, 1000)",
    "    if ($r.TimedOut) { continue }",
    "    $eventJson = [pscustomobject]@{",
    "      type = 'fs'",
    "      change_type = [string]$r.ChangeType",
    "      name = if ($null -eq $r.Name) { $null } else { [string]$r.Name }",
    "      old_name = if ($null -eq $r.OldName) { $null } else { [string]$r.OldName }",
    "    } | ConvertTo-Json -Compress",
    "    [Console]::Out.WriteLine($eventJson)",
    "    [Console]::Out.Flush()",
    "  }",
    "} finally {",
    "  $watcher.Dispose()",
    "}",
  ].join("\n");
}

function normalizedEventPath(session, name) {
  if (session.kind === "file") return session.path;
  if (!name) return session.path;
  return path.resolve(session.path, name);
}

function processBackendLine(session, line) {
  const trimmed = line.trim();
  if (!trimmed) return;

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    session.lastError = `Watcher backend emitted non-JSON output: ${trimmed}`;
    addEvent(session, {
      type: "error",
      error_message: session.lastError,
      path: session.path,
    });
    return;
  }

  if (parsed.type === "ready") {
    session.ready = true;
    session.readyResolve?.();
    session.readyResolve = null;
    session.readyReject = null;
    return;
  }

  if (parsed.type === "fs") {
    const eventPath = normalizedEventPath(session, parsed.name);
    const oldPath = parsed.old_name ? normalizedEventPath(session, parsed.old_name) : null;
    addEvent(session, {
      type: "fs",
      event_type: String(parsed.change_type || "").toLowerCase(),
      filename: parsed.name ?? null,
      old_filename: parsed.old_name ?? null,
      relative_path: session.kind === "directory"
        ? (parsed.name ?? ".")
        : path.basename(session.path),
      path: eventPath,
      old_path: oldPath,
    });
  }
}

async function startWindowsBackend(session) {
  const script = windowsWatcherScript(session);
  const child = spawn("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  session.child = child;
  let stdoutBuffer = "";
  let stderrBuffer = "";

  const readyPromise = new Promise((resolve, reject) => {
    session.readyResolve = resolve;
    session.readyReject = reject;
  });

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    while (true) {
      const newline = stdoutBuffer.indexOf("\n");
      if (newline < 0) break;
      const line = stdoutBuffer.slice(0, newline).replace(/\r$/, "");
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      processBackendLine(session, line);
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderrBuffer = (stderrBuffer + chunk).slice(-16000);
  });

  child.once("error", (error) => {
    session.lastError = error.message;
    session.readyReject?.(error);
    session.readyResolve = null;
    session.readyReject = null;
  });

  child.once("exit", (code, signal) => {
    if (!session.stopped) {
      session.stopped = true;
      const detail = stderrBuffer.trim();
      session.lastError = `Watcher backend exited unexpectedly (code=${code}, signal=${signal})${detail ? `: ${detail}` : ""}`;
      addEvent(session, {
        type: "error",
        error_message: session.lastError,
        path: session.path,
      });
      session.readyReject?.(new Error(session.lastError));
      session.readyResolve = null;
      session.readyReject = null;
    }
  });

  const timeout = new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error("Watcher backend readiness timed out.")), 5000);
    timer.unref?.();
  });

  try {
    await Promise.race([readyPromise, timeout]);
  } catch (error) {
    try { child.kill(); } catch {}
    throw error;
  }
}

function startNativeBackend(session) {
  const watcher = fs.watch(
    session.path,
    { recursive: session.recursive, persistent: false, encoding: "utf8" },
    (eventType, filename) => {
      const name = filename == null ? null : String(filename);
      addEvent(session, {
        type: "fs",
        event_type: eventType,
        filename: name,
        old_filename: null,
        relative_path: session.kind === "directory" ? (name ?? ".") : path.basename(session.path),
        path: normalizedEventPath(session, name),
        old_path: null,
      });
    }
  );

  watcher.on("error", (error) => {
    session.lastError = error.message;
    addEvent(session, {
      type: "error",
      error_code: error.code ?? null,
      error_message: error.message,
      path: session.path,
    });
  });

  session.nativeWatcher = watcher;
  session.ready = true;
}

async function initializeBackend(session) {
  if (process.platform === "win32") {
    session.backend = "dotnet-filesystemwatcher";
    await startWindowsBackend(session);
  } else {
    session.backend = "node-fs-watch";
    startNativeBackend(session);
  }
}

function closeSession(session) {
  session.stopped = true;
  try { session.nativeWatcher?.close(); } catch {}
  try { session.child?.kill(); } catch {}
}

export function registerFileWatcherTools(server, config) {
  server.tool("watch_path", "Start a bounded filesystem watcher session and return a watcher ID after backend readiness.", {
    path: z.string().min(1),
    recursive: z.boolean().optional(),
    max_buffer_events: z.number().int().min(10).max(10000).optional(),
  }, async ({ path: inputPath, recursive = false, max_buffer_events = 1000 }) => {
    try {
      const watchPath = resolveAllowed(inputPath, config);
      const stat = await fsp.stat(watchPath);
      const kind = stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other";
      if (kind === "other") throw new Error(`Unsupported watch target type: ${watchPath}`);
      if (kind === "file" && recursive) throw new Error("recursive=true is valid only for directory targets.");

      const id = `watch-${Date.now()}-${++watcherCounter}`;
      const session = {
        id,
        path: watchPath,
        kind,
        recursive,
        backend: null,
        maxBufferEvents: max_buffer_events,
        events: [],
        nextSeq: 1,
        droppedThroughSeq: 0,
        stopped: false,
        startedAt: new Date().toISOString(),
        lastError: null,
        ready: false,
        child: null,
        nativeWatcher: null,
        readyResolve: null,
        readyReject: null,
      };

      await initializeBackend(session);
      watchers.set(id, session);
      return textResult(snapshot(session));
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("watch_events", "Read buffered filesystem events after a sequence cursor without waiting.", {
    watcher_id: z.string().min(1),
    after_seq: z.number().int().min(0).optional(),
    max_events: z.number().int().min(1).max(1000).optional(),
  }, async ({ watcher_id, after_seq = 0, max_events = 100 }) => {
    const session = watchers.get(watcher_id);
    if (!session) return textResult(`Unknown watcher: ${watcher_id}`, true);

    const all = session.events.filter((event) => event.seq > after_seq);
    const events = all.slice(0, max_events);
    const nextCursor = events.length ? events[events.length - 1].seq : after_seq;

    return textResult({
      watcher: snapshot(session),
      after_seq,
      overflowed: after_seq < session.droppedThroughSeq,
      earliest_available_seq: session.events[0]?.seq ?? session.nextSeq,
      events,
      event_count: events.length,
      has_more: all.length > events.length,
      next_cursor: nextCursor,
    });
  });

  server.tool("watch_status", "Return status for one filesystem watcher session.", {
    watcher_id: z.string().min(1),
  }, async ({ watcher_id }) => {
    const session = watchers.get(watcher_id);
    if (!session) return textResult(`Unknown watcher: ${watcher_id}`, true);
    return textResult(snapshot(session));
  });

  server.tool("stop_watch", "Stop and remove a filesystem watcher session.", {
    watcher_id: z.string().min(1),
  }, async ({ watcher_id }) => {
    const session = watchers.get(watcher_id);
    if (!session) return textResult(`Unknown watcher: ${watcher_id}`, true);

    closeSession(session);
    const final = snapshot(session);
    watchers.delete(watcher_id);
    return textResult({ stopped: true, watcher: final });
  });
}
