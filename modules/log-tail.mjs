import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const followers = new Map();
let followerCounter = 0;

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

function identityFromStat(stat) {
  return `${String(stat.dev)}:${String(stat.ino)}:${stat.birthtimeMs}`;
}

async function readRange(filePath, start, length) {
  if (length <= 0) return Buffer.alloc(0);
  const handle = await fsp.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function readTailRegion(filePath, maxBytes) {
  const stat = await fsp.stat(filePath);
  if (!stat.isFile()) throw new Error(`Path is not a file: ${filePath}`);
  const start = Math.max(0, stat.size - maxBytes);
  let buffer = await readRange(filePath, start, stat.size - start);
  let text = buffer.toString("utf8");
  let discardedPartialLine = false;

  if (start > 0) {
    const newline = text.indexOf("\n");
    if (newline >= 0) {
      text = text.slice(newline + 1);
      discardedPartialLine = true;
    } else {
      text = "";
      discardedPartialLine = true;
    }
  }

  return {
    stat,
    start,
    text,
    discardedPartialLine,
  };
}

function eventCost(event) {
  return (event.text?.length ?? 0) + 256;
}

function addEvent(session, event) {
  const full = {
    seq: session.nextSeq++,
    timestamp: new Date().toISOString(),
    ...event,
  };
  session.events.push(full);
  session.bufferChars += eventCost(full);

  while (session.events.length > 1 && session.bufferChars > session.maxBufferChars) {
    const dropped = session.events.shift();
    session.bufferChars -= eventCost(dropped);
    session.droppedThroughSeq = dropped.seq;
  }

  return full;
}

async function pollFollower(session) {
  if (session.stopped || session.polling) return;
  session.polling = true;
  try {
    let stat;
    try {
      stat = await fsp.stat(session.path);
      if (!stat.isFile()) throw new Error("Path is no longer a file.");
    } catch (error) {
      if (session.exists) {
        addEvent(session, {
          type: "missing",
          path: session.path,
          error_code: error.code ?? null,
          error_message: error.message,
        });
      }
      session.exists = false;
      session.lastError = error.message;
      return;
    }

    const identity = identityFromStat(stat);

    if (!session.exists) {
      addEvent(session, {
        type: "reappear",
        path: session.path,
        identity,
        size_bytes: stat.size,
      });
      session.exists = true;
      session.identity = identity;
      session.offset = 0;
    } else if (identity !== session.identity) {
      addEvent(session, {
        type: "rotate",
        path: session.path,
        old_identity: session.identity,
        new_identity: identity,
        size_bytes: stat.size,
      });
      session.identity = identity;
      session.offset = 0;
    } else if (stat.size < session.offset) {
      addEvent(session, {
        type: "truncate",
        path: session.path,
        previous_offset: session.offset,
        new_size_bytes: stat.size,
      });
      session.offset = 0;
    }

    session.lastError = null;

    if (stat.size > session.offset) {
      const start = session.offset;
      const maxRead = Math.min(session.maxReadBytes, session.maxBufferChars);
      const end = Math.min(stat.size, start + maxRead);
      const buffer = await readRange(session.path, start, end - start);
      const text = buffer.toString("utf8");
      session.offset = start + buffer.length;
      addEvent(session, {
        type: "append",
        path: session.path,
        byte_start: start,
        byte_end: session.offset,
        file_size_bytes: stat.size,
        more_pending: session.offset < stat.size,
        text,
      });
    }
  } catch (error) {
    session.lastError = error.message;
    addEvent(session, {
      type: "error",
      path: session.path,
      error_code: error.code ?? null,
      error_message: error.message,
    });
  } finally {
    session.polling = false;
  }
}

function followerSnapshot(session) {
  return {
    follower_id: session.id,
    path: session.path,
    running: !session.stopped,
    exists: session.exists,
    offset: session.offset,
    identity: session.identity,
    poll_interval_ms: session.pollIntervalMs,
    max_buffer_chars: session.maxBufferChars,
    max_read_bytes: session.maxReadBytes,
    next_seq: session.nextSeq,
    dropped_through_seq: session.droppedThroughSeq,
    buffered_event_count: session.events.length,
    last_error: session.lastError,
    started_at: session.startedAt,
    stopped_at: session.stoppedAt ?? null,
  };
}

export function listLogFollowerSnapshots() {
  return [...followers.values()].map(followerSnapshot);
}

export function pruneStoppedLogFollowers() {
  const released = [];
  for (const [id, session] of followers.entries()) {
    if (!session.stopped) continue;
    if (session.timer) clearInterval(session.timer);
    followers.delete(id);
    released.push(id);
  }
  return released;
}

export function registerLogTailTools(server, config) {
  server.tool("tail_file", "Read the last lines of a text log with a bounded byte scan.", {
    path: z.string().min(1),
    lines: z.number().int().min(1).max(5000).optional(),
    max_bytes: z.number().int().min(1024).max(10485760).optional(),
  }, async ({ path: inputPath, lines = 100, max_bytes = 1048576 }) => {
    try {
      const filePath = resolveAllowed(inputPath, config);
      const region = await readTailRegion(filePath, max_bytes);
      const split = region.text.split(/\r?\n/);
      if (split.length && split[split.length - 1] === "") split.pop();
      const selected = split.slice(-lines);
      return textResult({
        path: filePath,
        file_size_bytes: region.stat.size,
        scanned_from_byte: region.start,
        truncated_before: region.start > 0,
        discarded_partial_line: region.discardedPartialLine,
        requested_lines: lines,
        returned_lines: selected.length,
        lines: selected,
      });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("follow_log", "Start a bounded background log follower and return a follower ID immediately.", {
    path: z.string().min(1),
    from_end: z.boolean().optional(),
    poll_interval_ms: z.number().int().min(100).max(5000).optional(),
    max_buffer_chars: z.number().int().min(10000).max(2000000).optional(),
    max_read_bytes: z.number().int().min(1024).max(1048576).optional(),
  }, async ({
    path: inputPath,
    from_end = true,
    poll_interval_ms = 250,
    max_buffer_chars = 240000,
    max_read_bytes = 65536,
  }) => {
    try {
      const filePath = resolveAllowed(inputPath, config);
      const stat = await fsp.stat(filePath);
      if (!stat.isFile()) throw new Error(`Path is not a file: ${filePath}`);

      const id = `log-${Date.now()}-${++followerCounter}`;
      const session = {
        id,
        path: filePath,
        exists: true,
        identity: identityFromStat(stat),
        offset: from_end ? stat.size : 0,
        pollIntervalMs: poll_interval_ms,
        maxBufferChars: max_buffer_chars,
        maxReadBytes: max_read_bytes,
        events: [],
        bufferChars: 0,
        nextSeq: 1,
        droppedThroughSeq: 0,
        stopped: false,
        stoppedAt: null,
        polling: false,
        lastError: null,
        startedAt: new Date().toISOString(),
        timer: null,
      };

      followers.set(id, session);
      await pollFollower(session);
      session.timer = setInterval(() => {
        pollFollower(session).catch(() => {});
      }, poll_interval_ms);
      session.timer.unref?.();

      return textResult(followerSnapshot(session));
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("read_log_events", "Read buffered log follower events after a sequence cursor without waiting.", {
    follower_id: z.string().min(1),
    after_seq: z.number().int().min(0).optional(),
    max_events: z.number().int().min(1).max(500).optional(),
  }, async ({ follower_id, after_seq = 0, max_events = 100 }) => {
    const session = followers.get(follower_id);
    if (!session) return textResult(`Unknown log follower: ${follower_id}`, true);

    await pollFollower(session);
    const all = session.events.filter((event) => event.seq > after_seq);
    const events = all.slice(0, max_events);
    const nextCursor = events.length ? events[events.length - 1].seq : after_seq;

    return textResult({
      follower: followerSnapshot(session),
      after_seq,
      overflowed: after_seq < session.droppedThroughSeq,
      earliest_available_seq: session.events[0]?.seq ?? session.nextSeq,
      events,
      event_count: events.length,
      has_more: all.length > events.length,
      next_cursor: nextCursor,
    });
  });

  server.tool("search_log", "Search a bounded tail region of a text log using literal or regular-expression matching.", {
    path: z.string().min(1),
    query: z.string().min(1),
    regex: z.boolean().optional(),
    case_sensitive: z.boolean().optional(),
    max_matches: z.number().int().min(1).max(1000).optional(),
    max_bytes: z.number().int().min(1024).max(10485760).optional(),
  }, async ({
    path: inputPath,
    query,
    regex = false,
    case_sensitive = false,
    max_matches = 100,
    max_bytes = 5242880,
  }) => {
    try {
      const filePath = resolveAllowed(inputPath, config);
      const region = await readTailRegion(filePath, max_bytes);
      let matcher;

      if (regex) {
        matcher = new RegExp(query, case_sensitive ? "" : "i");
      } else {
        const needle = case_sensitive ? query : query.toLowerCase();
        matcher = {
          test(value) {
            const haystack = case_sensitive ? value : value.toLowerCase();
            return haystack.includes(needle);
          }
        };
      }

      const lines = region.text.split(/\r?\n/);
      const matches = [];
      for (let i = 0; i < lines.length && matches.length < max_matches; i++) {
        if (matcher.test(lines[i])) {
          matches.push({ line_in_scanned_region: i + 1, text: lines[i] });
        }
      }

      return textResult({
        path: filePath,
        query,
        regex,
        case_sensitive,
        file_size_bytes: region.stat.size,
        scanned_from_byte: region.start,
        truncated_before: region.start > 0,
        match_count: matches.length,
        max_matches,
        matches,
      });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("stop_log_follow", "Stop and remove a log follower session.", {
    follower_id: z.string().min(1),
  }, async ({ follower_id }) => {
    const session = followers.get(follower_id);
    if (!session) return textResult(`Unknown log follower: ${follower_id}`, true);

    session.stopped = true;
    session.stoppedAt ??= new Date().toISOString();
    if (session.timer) clearInterval(session.timer);
    const summary = followerSnapshot(session);
    followers.delete(follower_id);
    return textResult({ stopped: true, follower: summary });
  });
}
