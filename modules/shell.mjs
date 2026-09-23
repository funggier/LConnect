import path from "node:path";
import { z } from "zod";
import { formatRunResult, runPowerShell, runProcess } from "./runtime.mjs";

function textResult(text, isError = false) {
  return { content: [{ type: "text", text: String(text) }], ...(isError ? { isError: true } : {}) };
}

export function registerShellTools(server, config) {
  const enabled = config.shell.enabled && process.env.MCP_ENABLE_POWERSHELL !== "false";
  const clampTimeout = (value) =>
    Math.min(
      Math.max(1, Number(value ?? config.shell.defaultTimeoutSeconds)),
      config.shell.maxTimeoutSeconds
    );

  server.tool("powershell_run", "Run a short PowerShell command on the local Windows computer. Synchronous execution is capped by the LConnect MCP request budget; use start_process for long-running work.", {
    command: z.string().min(1).max(50000),
    timeout_seconds: z.number().int().min(1).optional(),
    cwd: z.string().min(1).optional(),
  }, async ({ command, timeout_seconds, cwd }) => {
    if (!enabled) return textResult("Shell control is disabled.", true);
    const result = await runPowerShell(command, {
      cwd: cwd ? path.resolve(cwd) : undefined,
      timeoutSeconds: clampTimeout(timeout_seconds),
      maxOutputChars: config.shell.maxOutputChars,
    });
    return textResult(formatRunResult(result), Boolean(result.error || result.timedOut || result.code));
  });

  server.tool("command_run", "Run a short executable command with an argument array. Synchronous execution is capped by the LConnect MCP request budget; use start_process for long-running work. On Windows, launch failures are retried through PowerShell.", {
    program: z.string().min(1),
    args: z.array(z.string()).optional(),
    timeout_seconds: z.number().int().min(1).optional(),
    cwd: z.string().min(1).optional(),
  }, async ({ program, args, timeout_seconds, cwd }) => {
    if (!enabled) return textResult("Shell control is disabled.", true);
    const runArgs = args || [];
    const options = {
      cwd: cwd ? path.resolve(cwd) : undefined,
      timeoutSeconds: clampTimeout(timeout_seconds),
      maxOutputChars: config.shell.maxOutputChars,
    };

    const isWindowsBatch =
      process.platform === "win32" && /\.(?:cmd|bat)$/i.test(program);

    let result = isWindowsBatch
      ? { error: "batch file requires Windows shell" }
      : await runProcess(program, runArgs, options);

    const shouldRetryViaPowerShell =
      process.platform === "win32" &&
      (
        isWindowsBatch ||
        Boolean(result.error) ||
        result.code === 0xC0000142
      );

    if (shouldRetryViaPowerShell) {
      const psLiteral = (value) => "'" + String(value).replace(/'/g, "''") + "'";
      const argList = runArgs.map(psLiteral).join(", ");
      const script = [
        `$lconnectArgs = @(${argList})`,
        `& ${psLiteral(program)} @lconnectArgs`,
        "if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }",
      ].join("; ");
      result = await runPowerShell(script, options);
    }

    return textResult(formatRunResult(result), Boolean(result.error || result.timedOut || result.code));
  });
}
