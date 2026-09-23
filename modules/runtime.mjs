import { spawn } from "node:child_process";
import path from "node:path";

let maxSynchronousRequestSeconds = 15;

function appendLimited(current, chunk, maxChars) {
  return (current + chunk.toString("utf8")).slice(-maxChars);
}

function normalizeBudget(value, fallback = 15) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(120, Math.max(1, parsed));
}

export function configureRuntime({ maxSynchronousRequestSeconds: value } = {}) {
  maxSynchronousRequestSeconds = normalizeBudget(value, maxSynchronousRequestSeconds);
  return { maxSynchronousRequestSeconds };
}

export function getRuntimeRequestBudget() {
  return { maxSynchronousRequestSeconds };
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

    const requestedTimeoutSeconds = Math.max(1, Number(timeoutSeconds) || 1);
    const effectiveTimeoutSeconds = Math.min(
      requestedTimeoutSeconds,
      maxSynchronousRequestSeconds
    );
    const timeoutCapped = effectiveTimeoutSeconds < requestedTimeoutSeconds;

    const child = spawn(program, args, {
      cwd: cwd ? path.resolve(cwd) : undefined,
      windowsHide,
      shell,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const withTimeoutEvidence = (result) => ({
      ...result,
      timeoutRequestedSeconds: requestedTimeoutSeconds,
      timeoutEffectiveSeconds: effectiveTimeoutSeconds,
      timeoutCapped,
    });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(withTimeoutEvidence(result));
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
      // Do not wait for child "close" after the request budget expires.
      // Descendants can retain inherited stdout/stderr handles and delay close
      // beyond the MCP response budget even after the direct child exits.
      try { child.stdout?.destroy(); } catch {}
      try { child.stderr?.destroy(); } catch {}
      finish({ code: null, signal: null, stdout, stderr, timedOut: true });
    }, effectiveTimeoutSeconds * 1000);

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
  const timeoutEvidence = result.timeoutCapped
    ? `\ntimeout_budget: requested=${result.timeoutRequestedSeconds}s effective=${result.timeoutEffectiveSeconds}s capped=true`
    : "";

  if (result.error) {
    return `Failed to launch process: ${result.error}${timeoutEvidence}\n\nstdout:\n${result.stdout || "(empty)"}\n\nstderr:\n${result.stderr || "(empty)"}`;
  }

  return [
    `exit_code: ${result.code ?? "null"}${result.signal ? ` signal=${result.signal}` : ""}${result.timedOut ? " (timed out)" : ""}`,
    ...(timeoutEvidence ? [timeoutEvidence.trim()] : []),
    "",
    "stdout:",
    result.stdout || "(empty)",
    "",
    "stderr:",
    result.stderr || "(empty)",
  ].join("\n");
}
