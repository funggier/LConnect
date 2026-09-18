import { spawn } from "node:child_process";
import path from "node:path";

function appendLimited(current, chunk, maxChars) {
  return (current + chunk.toString("utf8")).slice(-maxChars);
}

export function runProcess(program, args = [], options = {}) {
  const {
    cwd,
    timeoutSeconds = 60,
    maxOutputChars = 120000,
    windowsHide = true,
    shell = false,
  } = options;

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const child = spawn(program, args, {
      cwd: cwd ? path.resolve(cwd) : undefined,
      windowsHide,
      shell,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    child.stdout?.on("data", (chunk) => {
      stdout = appendLimited(stdout, chunk, maxOutputChars);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = appendLimited(stderr, chunk, maxOutputChars);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch {}
    }, Math.max(1, timeoutSeconds) * 1000);

    child.on("error", (error) => {
      clearTimeout(timer);
      finish({ error: error.message, stdout, stderr, timedOut });
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      finish({ code, signal, stdout, stderr, timedOut });
    });
  });
}

export function runPowerShell(command, options = {}) {
  return runProcess(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      command,
    ],
    options
  );
}

export function formatRunResult(result) {
  if (result.error) {
    return `Failed to launch process: ${result.error}\n\nstdout:\n${result.stdout || "(empty)"}\n\nstderr:\n${result.stderr || "(empty)"}`;
  }

  return [
    `exit_code: ${result.code ?? "null"}${result.signal ? ` signal=${result.signal}` : ""}${result.timedOut ? " (timed out)" : ""}`,
    "",
    "stdout:",
    result.stdout || "(empty)",
    "",
    "stderr:",
    result.stderr || "(empty)",
  ].join("\n");
}
