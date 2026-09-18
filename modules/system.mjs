import os from "node:os";
import { z } from "zod";
import { formatRunResult, runPowerShell, runProcess } from "./runtime.mjs";

function textResult(text, isError = false) {
  return { content: [{ type: "text", text: String(text) }], ...(isError ? { isError: true } : {}) };
}

export function registerSystemTools(server, config) {
  const executionEnabled = config.shell.enabled && process.env.MCP_ENABLE_POWERSHELL !== "false";

  server.tool("system_info", "Return basic local machine and Node runtime information.", {}, async () => {
    const info = {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpu_count: os.cpus().length,
      cpu_model: os.cpus()[0]?.model ?? null,
      total_memory_bytes: os.totalmem(),
      free_memory_bytes: os.freemem(),
      uptime_seconds: os.uptime(),
      node_version: process.version,
      process_id: process.pid,
      working_directory: process.cwd(),
      full_machine_access: config.fullMachineAccess,
      allowed_directories: config.fullMachineAccess ? null : config.allowedDirectories,
    };
    return textResult(JSON.stringify(info, null, 2));
  });

  server.tool("list_processes", "List Windows processes with PID, name and executable path when available.", {}, async () => {
    if (!executionEnabled) return textResult("Process inspection is disabled.", true);
    const command = "Get-Process | Select-Object Id,ProcessName,Path,CPU,WorkingSet64 | ConvertTo-Json -Compress";
    const result = await runPowerShell(command, {
      timeoutSeconds: 30,
      maxOutputChars: config.shell.maxOutputChars,
    });
    return textResult(formatRunResult(result), Boolean(result.error || result.timedOut || result.code));
  });

  server.tool("kill_process", "Terminate a Windows process by PID using taskkill.", {
    pid: z.number().int().min(1),
    force: z.boolean().optional(),
    tree: z.boolean().optional(),
  }, async ({ pid, force, tree }) => {
    if (!executionEnabled) return textResult("Process execution is disabled.", true);
    const args = ["/PID", String(pid)];
    if (tree) args.push("/T");
    if (force !== false) args.push("/F");
    const quotedArgs = args.map((value) => "'" + value.replace(/'/g, "''") + "'").join(", ");
    const command = [
      `$lconnectArgs = @(${quotedArgs})`,
      '& "$env:SystemRoot\\System32\\taskkill.exe" @lconnectArgs',
      "if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }",
    ].join("; ");
    const result = await runPowerShell(command, {
      timeoutSeconds: 30,
      maxOutputChars: config.shell.maxOutputChars,
    });
    return textResult(formatRunResult(result), Boolean(result.error || result.timedOut || result.code));
  });

  server.tool("list_listening_ports", "List local TCP listening ports and owning process IDs.", {}, async () => {
    if (!executionEnabled) return textResult("Network inspection is disabled.", true);
    const command =
      '& "$env:SystemRoot\\System32\\netstat.exe" -ano -p tcp ' +
      '| Select-String LISTENING ' +
      '| ForEach-Object { $_.Line }; ' +
      'if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }';
    const result = await runPowerShell(command, {
      timeoutSeconds: 30,
      maxOutputChars: config.shell.maxOutputChars,
    });
    return textResult(formatRunResult(result), Boolean(result.error || result.timedOut || result.code));
  });
}
