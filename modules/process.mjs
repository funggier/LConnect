import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";

const sessions = new Map();
let counter = 0;

function textResult(value, isError = false) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

function appendLimited(current, chunk, maxChars) {
  return (current + chunk.toString("utf8")).slice(-maxChars);
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
  session.eventBufferChars += eventCost(full);

  while (session.events.length > 1 && session.eventBufferChars > session.maxEventBufferChars) {
    const dropped = session.events.shift();
    session.eventBufferChars -= eventCost(dropped);
    session.droppedThroughSeq = dropped.seq;
  }
  return full;
}

function addOutputEvents(session, stream, chunk) {
  const text = chunk.toString("utf8");
  const maxChunk = Math.max(
    1024,
    Math.min(65536, Math.floor(session.maxEventBufferChars / 2))
  );
  if (!text.length) {
    addEvent(session, { type: "output", stream, text: "" });
    return;
  }
  for (let i = 0; i < text.length; i += maxChunk) {
    addEvent(session, {
      type: "output",
      stream,
      text: text.slice(i, i + maxChunk),
    });
  }
}

function elapsedMs(session) {
  const start = Date.parse(session.startedAt);
  const end = session.completedAt ? Date.parse(session.completedAt) : Date.now();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : null;
}

function finalizeSession(session, code, signal) {
  if (session.completedAt) return;
  session.running = false;
  session.exitCode = code;
  session.signal = signal;
  session.completedAt = new Date().toISOString();
  addEvent(session, {
    type: "exit",
    exit_code: code,
    signal,
  });
}

function snapshot(session, { includeOutput = true } = {}) {
  const result = {
    session_id: session.id,
    label: session.label,
    pid: session.child.pid ?? null,
    program: session.program,
    args: session.args,
    cwd: session.cwd ?? null,
    running: session.running,
    exit_code: session.exitCode,
    signal: session.signal,
    started_at: session.startedAt,
    completed_at: session.completedAt,
    streams_closed: session.streamsClosed,
    closed_at: session.closedAt,
    elapsed_ms: elapsedMs(session),
    next_seq: session.nextSeq,
    dropped_through_seq: session.droppedThroughSeq,
    buffered_event_count: session.events.length,
  };
  if (includeOutput) {
    result.stdout = session.stdout;
    result.stderr = session.stderr;
  }
  return result;
}

function outputTail(session, maxChars) {
  return {
    stdout: session.stdout.slice(-maxChars),
    stderr: session.stderr.slice(-maxChars),
  };
}

export function startManagedProcessSession({
  program,
  args = [],
  cwd,
  config,
  env,
  windowsHide = true,
  label = null,
}) {
  const resolvedCwd = cwd ? path.resolve(cwd) : undefined;
  const child = spawn(program, args, {
    cwd: resolvedCwd,
    windowsHide,
    stdio: ["pipe", "pipe", "pipe"],
    env: env ? { ...process.env, ...env } : undefined,
  });

  const id = `proc-${Date.now()}-${++counter}`;
  const session = {
    id,
    label: label || null,
    child,
    program,
    args,
    cwd: resolvedCwd,
    running: true,
    exitCode: null,
    signal: null,
    stdout: "",
    stderr: "",
    startedAt: new Date().toISOString(),
    completedAt: null,
    streamsClosed: false,
    closedAt: null,
    events: [],
    nextSeq: 1,
    droppedThroughSeq: 0,
    eventBufferChars: 0,
    maxEventBufferChars: config.process.maxBufferedOutputChars,
  };
  sessions.set(id, session);

  child.stdout?.on("data", (chunk) => {
    session.stdout = appendLimited(
      session.stdout,
      chunk,
      config.process.maxBufferedOutputChars
    );
    addOutputEvents(session, "stdout", chunk);
  });

  child.stderr?.on("data", (chunk) => {
    session.stderr = appendLimited(
      session.stderr,
      chunk,
      config.process.maxBufferedOutputChars
    );
    addOutputEvents(session, "stderr", chunk);
  });

  child.on("error", (error) => {
    session.running = false;
    session.completedAt ??= new Date().toISOString();
    session.stderr = appendLimited(
      session.stderr,
      `\nLaunch error: ${error.message}\n`,
      config.process.maxBufferedOutputChars
    );
    addEvent(session, {
      type: "launch_error",
      error_message: error.message,
    });
  });

  child.on("exit", (code, signal) => {
    finalizeSession(session, code, signal);
  });

  child.on("close", (code, signal) => {
    // Fallback only. The process lifecycle is terminal at "exit"; waiting for
    // "close" can be delayed when descendants retain inherited stdio handles.
    finalizeSession(session, code, signal);
    if (!session.streamsClosed) {
      session.streamsClosed = true;
      session.closedAt = new Date().toISOString();
      addEvent(session, {
        type: "streams_closed",
      });
    }
  });

  return snapshot(session);
}

export function getManagedProcessSessionSnapshot(sessionId, options) {
  const session = sessions.get(sessionId);
  return session ? snapshot(session, options) : null;
}

export function listManagedProcessSessions(options) {
  return [...sessions.values()].map((session) => snapshot(session, options));
}

export function clearManagedProcessSessionOutput(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.stdout = "";
  session.stderr = "";
  return true;
}

export function writeManagedProcessSessionInput(sessionId, input, newline = true) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Unknown session: ${sessionId}`);
  if (!session.running || !session.child.stdin?.writable) {
    throw new Error(`Session is not accepting input: ${sessionId}`);
  }
  session.child.stdin.write(input + (newline ? "\n" : ""));
}

export function terminateManagedProcessSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Unknown session: ${sessionId}`);
  if (session.running) session.child.kill();
  return true;
}

export function releaseManagedProcessSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return { released: false, reason: "not_found", session_id: sessionId };
  if (session.running) {
    return {
      released: false,
      reason: "running",
      session: snapshot(session, { includeOutput: false }),
    };
  }
  const final = snapshot(session, { includeOutput: false });
  sessions.delete(sessionId);
  return { released: true, session: final };
}

export function pruneManagedProcessSessions({
  olderThanSeconds = 0,
  dryRun = true,
} = {}) {
  const now = Date.now();
  const matched = [];
  const released = [];
  const skippedRunning = [];

  for (const session of sessions.values()) {
    if (session.running) {
      skippedRunning.push(session.id);
      continue;
    }
    const completedAt = Date.parse(session.completedAt || session.startedAt);
    const ageSeconds = Number.isFinite(completedAt)
      ? Math.max(0, (now - completedAt) / 1000)
      : Number.POSITIVE_INFINITY;
    if (ageSeconds >= olderThanSeconds) {
      matched.push(session.id);
      if (!dryRun) {
        sessions.delete(session.id);
        released.push(session.id);
      }
    }
  }

  return {
    dry_run: dryRun,
    older_than_seconds: olderThanSeconds,
    matched_session_ids: matched,
    released_session_ids: released,
    skipped_running_session_ids: skippedRunning,
  };
}

export function readManagedProcessEvents(sessionId, afterSeq = 0, maxEvents = 100) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  const all = session.events.filter((event) => event.seq > afterSeq);
  const events = all.slice(0, maxEvents);
  const nextCursor = events.length ? events[events.length - 1].seq : afterSeq;
  return {
    session: snapshot(session, { includeOutput: false }),
    after_seq: afterSeq,
    overflowed: afterSeq < session.droppedThroughSeq,
    earliest_available_seq: session.events[0]?.seq ?? session.nextSeq,
    events,
    event_count: events.length,
    has_more: all.length > events.length,
    next_cursor: nextCursor,
  };
}

export async function waitManagedProcessSession(
  sessionId,
  {
    timeoutSeconds = 30,
    pollIntervalMs = 100,
    includeOutputTail = true,
    outputTailChars = 4000,
  } = {}
) {
  const session = sessions.get(sessionId);
  if (!session) return null;

  const deadline = Date.now() + timeoutSeconds * 1000;
  while (session.running && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return {
    ...snapshot(session, { includeOutput: false }),
    completed: !session.running,
    timed_out: session.running,
    output_tail: includeOutputTail ? outputTail(session, outputTailChars) : null,
  };
}

export function refreshManagedProcessState({
  pruneTerminal = false,
  olderThanSeconds = 3600,
  dryRun = true,
} = {}) {
  const before = listManagedProcessSessions({ includeOutput: false });
  const prune = pruneTerminal
    ? pruneManagedProcessSessions({ olderThanSeconds, dryRun })
    : {
        dry_run: dryRun,
        older_than_seconds: olderThanSeconds,
        matched_session_ids: [],
        released_session_ids: [],
        skipped_running_session_ids: before.filter((x) => x.running).map((x) => x.session_id),
      };
  const after = listManagedProcessSessions({ includeOutput: false });

  return {
    before: {
      running: before.filter((x) => x.running),
      terminal: before.filter((x) => !x.running),
    },
    prune,
    after: {
      running: after.filter((x) => x.running),
      terminal: after.filter((x) => !x.running),
    },
  };
}

export function registerProcessTools(server, config) {
  const enabled = config.shell.enabled && process.env.MCP_ENABLE_POWERSHELL !== "false";

  server.tool("start_process", "Start a long-running local process and return a session ID.", {
    program: z.string().min(1),
    args: z.array(z.string()).optional(),
    cwd: z.string().min(1).optional(),
    label: z.string().min(1).max(200).optional(),
  }, async ({ program, args, cwd, label }) => {
    if (!enabled) return textResult("Process execution is disabled.", true);
    try {
      return textResult(startManagedProcessSession({
        program,
        args: args || [],
        cwd,
        label,
        config,
      }));
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("read_process_output", "Read buffered stdout/stderr and status for a process session.", {
    session_id: z.string().min(1),
    clear: z.boolean().optional(),
  }, async ({ session_id, clear }) => {
    const result = getManagedProcessSessionSnapshot(session_id);
    if (!result) return textResult(`Unknown session: ${session_id}`, true);
    if (clear) clearManagedProcessSessionOutput(session_id);
    return textResult(result);
  });

  server.tool("read_process_events", "Read incremental process output/lifecycle events after a sequence cursor.", {
    session_id: z.string().min(1),
    after_seq: z.number().int().min(0).optional(),
    max_events: z.number().int().min(1).max(1000).optional(),
  }, async ({ session_id, after_seq = 0, max_events = 100 }) => {
    const result = readManagedProcessEvents(session_id, after_seq, max_events);
    if (!result) return textResult(`Unknown session: ${session_id}`, true);
    return textResult(result);
  });

  server.tool("wait_session", "Wait a bounded time for a managed process session without terminating it on timeout.", {
    session_id: z.string().min(1),
    timeout_seconds: z.number().min(0).max(30).optional(),
    poll_interval_ms: z.number().int().min(25).max(2000).optional(),
    include_output_tail: z.boolean().optional(),
    output_tail_chars: z.number().int().min(100).max(50000).optional(),
  }, async ({
    session_id,
    timeout_seconds = 30,
    poll_interval_ms = 100,
    include_output_tail = true,
    output_tail_chars = 4000,
  }) => {
    const result = await waitManagedProcessSession(session_id, {
      timeoutSeconds: timeout_seconds,
      pollIntervalMs: poll_interval_ms,
      includeOutputTail: include_output_tail,
      outputTailChars: output_tail_chars,
    });
    if (!result) return textResult(`Unknown session: ${session_id}`, true);
    return textResult(result);
  });

  server.tool("release_session", "Forget one terminal process session and its buffered evidence. Running sessions are refused.", {
    session_id: z.string().min(1),
  }, async ({ session_id }) => {
    const result = releaseManagedProcessSession(session_id);
    return textResult(result, !result.released);
  });

  server.tool("prune_sessions", "Dry-run or release terminal process sessions older than a specified age. Running sessions are never pruned.", {
    older_than_seconds: z.number().min(0).max(31536000).optional(),
    dry_run: z.boolean().optional(),
  }, async ({ older_than_seconds = 0, dry_run = true }) => {
    return textResult(pruneManagedProcessSessions({
      olderThanSeconds: older_than_seconds,
      dryRun: dry_run,
    }));
  });

  server.tool("write_process_input", "Write text to stdin of a running process session.", {
    session_id: z.string().min(1),
    input: z.string(),
    newline: z.boolean().optional(),
  }, async ({ session_id, input, newline }) => {
    try {
      writeManagedProcessSessionInput(session_id, input, newline !== false);
      return textResult(`Input written to ${session_id}`);
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("terminate_process", "Terminate a process session started by LConnect.", {
    session_id: z.string().min(1),
  }, async ({ session_id }) => {
    try {
      terminateManagedProcessSession(session_id);
      return textResult(`Termination requested for ${session_id}`);
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("list_sessions", "List process sessions started by this LConnect instance.", {}, async () => {
    return textResult(listManagedProcessSessions());
  });
}
