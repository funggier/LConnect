import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";

function textResult(text, isError = false) {
  return { content: [{ type: "text", text: String(text) }], ...(isError ? { isError: true } : {}) };
}

function appendLimited(current, chunk, maxChars) {
  return (current + chunk.toString("utf8")).slice(-maxChars);
}

export function registerProcessTools(server, config) {
  const enabled = config.shell.enabled && process.env.MCP_ENABLE_POWERSHELL !== "false";
  const sessions = new Map();
  let counter = 0;

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

  server.tool("start_process", "Start a long-running local process and return a session ID.", {
    program: z.string().min(1),
    args: z.array(z.string()).optional(),
    cwd: z.string().min(1).optional(),
  }, async ({ program, args, cwd }) => {
    if (!enabled) return textResult("Process execution is disabled.", true);
    try {
      const resolvedCwd = cwd ? path.resolve(cwd) : undefined;
      const child = spawn(program, args || [], {
        cwd: resolvedCwd,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const id = `proc-${Date.now()}-${++counter}`;
      const session = {
        id,
        child,
        program,
        args: args || [],
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
        session.stdout = appendLimited(session.stdout, chunk, config.process.maxBufferedOutputChars);
      });
      child.stderr?.on("data", (chunk) => {
        session.stderr = appendLimited(session.stderr, chunk, config.process.maxBufferedOutputChars);
      });
      child.on("error", (error) => {
        session.running = false;
        session.stderr = appendLimited(session.stderr, `\nLaunch error: ${error.message}\n`, config.process.maxBufferedOutputChars);
      });
      child.on("close", (code, signal) => {
        session.running = false;
        session.exitCode = code;
        session.signal = signal;
      });

      return textResult(JSON.stringify(snapshot(session), null, 2));
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("read_process_output", "Read buffered stdout/stderr and status for a process session.", {
    session_id: z.string().min(1),
    clear: z.boolean().optional(),
  }, async ({ session_id, clear }) => {
    const session = sessions.get(session_id);
    if (!session) return textResult(`Unknown session: ${session_id}`, true);
    const result = snapshot(session);
    if (clear) {
      session.stdout = "";
      session.stderr = "";
    }
    return textResult(JSON.stringify(result, null, 2));
  });

  server.tool("write_process_input", "Write text to stdin of a running process session.", {
    session_id: z.string().min(1),
    input: z.string(),
    newline: z.boolean().optional(),
  }, async ({ session_id, input, newline }) => {
    const session = sessions.get(session_id);
    if (!session) return textResult(`Unknown session: ${session_id}`, true);
    if (!session.running || !session.child.stdin?.writable) {
      return textResult(`Session is not accepting input: ${session_id}`, true);
    }
    session.child.stdin.write(input + (newline === false ? "" : "\n"));
    return textResult(`Input written to ${session_id}`);
  });

  server.tool("terminate_process", "Terminate a process session started by LConnect.", {
    session_id: z.string().min(1),
  }, async ({ session_id }) => {
    const session = sessions.get(session_id);
    if (!session) return textResult(`Unknown session: ${session_id}`, true);
    if (session.running) {
      try { session.child.kill(); } catch (error) { return textResult(error.message, true); }
    }
    return textResult(`Termination requested for ${session_id}`);
  });

  server.tool("list_sessions", "List process sessions started by this LConnect instance.", {}, async () => {
    return textResult(JSON.stringify([...sessions.values()].map(snapshot), null, 2));
  });
}
