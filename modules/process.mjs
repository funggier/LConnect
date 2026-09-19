import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";

const sessions = new Map();
let counter = 0;

function textResult(text, isError = false) {
  return { content: [{ type: "text", text: String(text) }], ...(isError ? { isError: true } : {}) };
}

function appendLimited(current, chunk, maxChars) {
  return (current + chunk.toString("utf8")).slice(-maxChars);
}

function snapshot(session) {
  return {
    session_id: session.id,
    pid: session.child.pid ?? null,
    program: session.program,
    args: session.args,
    cwd: session.cwd ?? null,
    running: session.running,
    exit_code: session.exitCode,
    signal: session.signal,
    started_at: session.startedAt,
    stdout: session.stdout,
    stderr: session.stderr,
  };
}

export function startManagedProcessSession({
  program,
  args = [],
  cwd,
  config,
  env,
  windowsHide = true,
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
  };
  sessions.set(id, session);

  child.stdout?.on("data", (chunk) => {
    session.stdout = appendLimited(
      session.stdout,
      chunk,
      config.process.maxBufferedOutputChars
    );
  });

  child.stderr?.on("data", (chunk) => {
    session.stderr = appendLimited(
      session.stderr,
      chunk,
      config.process.maxBufferedOutputChars
    );
  });

  child.on("error", (error) => {
    session.running = false;
    session.stderr = appendLimited(
      session.stderr,
      `\nLaunch error: ${error.message}\n`,
      config.process.maxBufferedOutputChars
    );
  });

  child.on("close", (code, signal) => {
    session.running = false;
    session.exitCode = code;
    session.signal = signal;
  });

  return snapshot(session);
}

export function getManagedProcessSessionSnapshot(sessionId) {
  const session = sessions.get(sessionId);
  return session ? snapshot(session) : null;
}

export function listManagedProcessSessions() {
  return [...sessions.values()].map(snapshot);
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

export function registerProcessTools(server, config) {
  const enabled = config.shell.enabled && process.env.MCP_ENABLE_POWERSHELL !== "false";

  server.tool("start_process", "Start a long-running local process and return a session ID.", {
    program: z.string().min(1),
    args: z.array(z.string()).optional(),
    cwd: z.string().min(1).optional(),
  }, async ({ program, args, cwd }) => {
    if (!enabled) return textResult("Process execution is disabled.", true);
    try {
      return textResult(JSON.stringify(startManagedProcessSession({
        program,
        args: args || [],
        cwd,
        config,
      }), null, 2));
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
    return textResult(JSON.stringify(result, null, 2));
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
    return textResult(JSON.stringify(listManagedProcessSessions(), null, 2));
  });
}
