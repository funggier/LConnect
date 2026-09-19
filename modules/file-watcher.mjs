import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
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

function snapshot(session) {
  return {
    watcher_id: session.id,
    path: session.path,
    kind: session.kind,
    recursive: session.recursive,
    running: !session.stopped,
    started_at: session.startedAt,
    next_seq: session.nextSeq,
    dropped_through_seq: session.droppedThroughSeq,
    buffered_event_count: session.events.length,
    max_buffer_events: session.maxBufferEvents,
    watched_directory_count: session.directoryWatchers?.size ?? 0,
    last_error: session.lastError,
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

function eventPathFor(session, watchedDirectory, filename) {
  if (session.kind === "file") return session.path;
  if (!filename) return watchedDirectory;
  return path.resolve(watchedDirectory, filename);
}

async function listDirectoriesRecursive(root) {
  const found = [root];
  const queue = [root];

  while (queue.length) {
    const current = queue.shift();
    let entries;
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const child = path.join(current, entry.name);
      found.push(child);
      queue.push(child);
    }
  }

  return found;
}

function attachDirectoryWatcher(session, directory) {
  if (session.directoryWatchers.has(directory) || session.stopped) return;

  const watcher = fs.watch(
    directory,
    { recursive: false, persistent: false, encoding: "utf8" },
    (eventType, filename) => {
      const name = filename == null ? null : String(filename);
      const eventPath = eventPathFor(session, directory, name);
      const relativePath = session.kind === "directory"
        ? path.relative(session.path, eventPath)
        : path.basename(eventPath);

      addEvent(session, {
        type: "fs",
        event_type: eventType,
        filename: name,
        relative_path: relativePath || ".",
        path: eventPath,
      });

      if (session.recursive && eventType === "rename") {
        scheduleDirectoryRefresh(session);
      }
    }
  );

  watcher.on("error", (error) => {
    session.lastError = error.message;
    addEvent(session, {
      type: "error",
      error_code: error.code ?? null,
      error_message: error.message,
      path: directory,
    });
  });

  session.directoryWatchers.set(directory, watcher);
}

async function refreshDirectoryWatchers(session) {
  if (session.stopped || session.kind !== "directory" || !session.recursive) return;

  let directories;
  try {
    directories = await listDirectoriesRecursive(session.path);
  } catch (error) {
    session.lastError = error.message;
    addEvent(session, {
      type: "error",
      error_code: error.code ?? null,
      error_message: error.message,
      path: session.path,
    });
    return;
  }

  const wanted = new Set(directories.map((dir) => path.resolve(dir)));

  for (const directory of wanted) {
    try {
      attachDirectoryWatcher(session, directory);
    } catch (error) {
      session.lastError = error.message;
      addEvent(session, {
        type: "error",
        error_code: error.code ?? null,
        error_message: error.message,
        path: directory,
      });
    }
  }

  for (const [directory, watcher] of [...session.directoryWatchers.entries()]) {
    if (!wanted.has(path.resolve(directory))) {
      try { watcher.close(); } catch {}
      session.directoryWatchers.delete(directory);
    }
  }

  session.lastError = null;
}

function scheduleDirectoryRefresh(session) {
  if (session.stopped || session.refreshScheduled) return;
  session.refreshScheduled = true;
  const timer = setTimeout(async () => {
    session.refreshScheduled = false;
    await refreshDirectoryWatchers(session);
  }, 25);
  timer.unref?.();
}

function attachFileWatcher(session) {
  const watcher = fs.watch(
    session.path,
    { recursive: false, persistent: false, encoding: "utf8" },
    (eventType, filename) => {
      const name = filename == null ? null : String(filename);
      addEvent(session, {
        type: "fs",
        event_type: eventType,
        filename: name,
        relative_path: path.basename(session.path),
        path: session.path,
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

  session.fileWatcher = watcher;
}

async function initializeWatchers(session) {
  if (session.kind === "file") {
    attachFileWatcher(session);
    return;
  }

  if (session.recursive) {
    await refreshDirectoryWatchers(session);
  } else {
    attachDirectoryWatcher(session, session.path);
  }
}

function closeSession(session) {
  session.stopped = true;
  try { session.fileWatcher?.close(); } catch {}
  for (const watcher of session.directoryWatchers.values()) {
    try { watcher.close(); } catch {}
  }
  session.directoryWatchers.clear();
}

export function registerFileWatcherTools(server, config) {
  server.tool("watch_path", "Start a bounded filesystem watcher session and return a watcher ID immediately.", {
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
        maxBufferEvents: max_buffer_events,
        events: [],
        nextSeq: 1,
        droppedThroughSeq: 0,
        stopped: false,
        startedAt: new Date().toISOString(),
        lastError: null,
        fileWatcher: null,
        directoryWatchers: new Map(),
        refreshScheduled: false,
      };

      await initializeWatchers(session);
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
