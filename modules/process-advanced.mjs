import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import { runPowerShell } from "./runtime.mjs";

function textResult(value, isError = false) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

function psLiteral(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

async function runPowerShellJson(script, config, timeoutSeconds = 30) {
  const result = await runPowerShell(script, {
    timeoutSeconds,
    maxOutputChars: config.shell.maxOutputChars,
  });

  if (result.error) {
    throw new Error(`Failed to launch PowerShell: ${result.error}`);
  }
  if (result.timedOut) {
    throw new Error("PowerShell process operation timed out.");
  }
  if (result.code) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`PowerShell process operation failed (exit ${result.code})${detail ? `: ${detail}` : ""}`);
  }

  const raw = (result.stdout || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse process operation output as JSON: ${error.message}`);
  }
}

function processProjectionScript(variable = "$p") {
  return `[pscustomobject]@{
    pid = [int]${variable}.ProcessId
    parent_pid = [int]${variable}.ParentProcessId
    name = [string]${variable}.Name
    executable_path = if ($null -eq ${variable}.ExecutablePath) { $null } else { [string]${variable}.ExecutablePath }
    command_line = if ($null -eq ${variable}.CommandLine) { $null } else { [string]${variable}.CommandLine }
    creation_time = if ($null -eq ${variable}.CreationDate) { $null } else { ${variable}.CreationDate.ToUniversalTime().ToString("o") }
    session_id = [int]${variable}.SessionId
    working_set_bytes = [long]${variable}.WorkingSetSize
    handle_count = [uint32]${variable}.HandleCount
    thread_count = [uint32]${variable}.ThreadCount
  }`;
}

function processTreeProjectionScript(variable = "$p") {
  return `[pscustomobject]@{
    pid = [int]${variable}.ProcessId
    parent_pid = [int]${variable}.ParentProcessId
    name = [string]${variable}.Name
    executable_path = if ($null -eq ${variable}.ExecutablePath) { $null } else { [string]${variable}.ExecutablePath }
    creation_time = if ($null -eq ${variable}.CreationDate) { $null } else { ${variable}.CreationDate.ToUniversalTime().ToString("o") }
  }`;
}

async function getProcessDetails(pid, config) {
  const script = [
    `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" -ErrorAction SilentlyContinue | Select-Object -First 1`,
    `if ($null -eq $p) { [pscustomobject]@{ found = $false; pid = ${pid} } | ConvertTo-Json -Compress; exit 0 }`,
    `$item = ${processProjectionScript("$p")}`,
    "[pscustomobject]@{ found = $true; process = $item } | ConvertTo-Json -Compress -Depth 4",
  ].join("; ");
  return runPowerShellJson(script, config, 20);
}

function sameCreationTime(actual, expected) {
  if (!actual || !expected) return false;
  const a = Date.parse(actual);
  const b = Date.parse(expected);
  if (Number.isFinite(a) && Number.isFinite(b)) return a === b;
  return String(actual) === String(expected);
}

async function getProcessTreeSnapshot(config) {
  const script = [
    "$items = @(Get-CimInstance Win32_Process | ForEach-Object {",
    `  $p = $_; ${processTreeProjectionScript("$p")}`,
    "})",
    "ConvertTo-Json -InputObject $items -Compress -Depth 4",
  ].join("\n");
  const parsed = await runPowerShellJson(script, config, 30);
  if (parsed == null) return [];
  return Array.isArray(parsed) ? parsed : [parsed];
}

function buildTree(processes, rootPid, maxDepth) {
  const byPid = new Map(processes.map((item) => [item.pid, item]));
  const children = new Map();

  for (const item of processes) {
    if (!children.has(item.parent_pid)) children.set(item.parent_pid, []);
    children.get(item.parent_pid).push(item);
  }

  for (const list of children.values()) {
    list.sort((a, b) => a.pid - b.pid);
  }

  const root = byPid.get(rootPid);
  if (!root) return null;

  let depthTruncated = false;

  function visit(item, depth, lineage) {
    if (lineage.has(item.pid)) {
      return { ...item, cycle_detected: true, children: [] };
    }

    const nextLineage = new Set(lineage);
    nextLineage.add(item.pid);

    const directChildren = children.get(item.pid) || [];
    if (depth >= maxDepth && directChildren.length) {
      depthTruncated = true;
      return { ...item, children: [], children_truncated: directChildren.length };
    }

    return {
      ...item,
      children: directChildren.map((child) => visit(child, depth + 1, nextLineage)),
    };
  }

  const ancestors = [];
  const seen = new Set([rootPid]);
  let parentPid = root.parent_pid;

  while (parentPid && byPid.has(parentPid) && !seen.has(parentPid) && ancestors.length < 64) {
    const parent = byPid.get(parentPid);
    ancestors.push(parent);
    seen.add(parentPid);
    parentPid = parent.parent_pid;
  }

  return {
    root: visit(root, 0, new Set()),
    ancestors,
    depth_truncated: depthTruncated,
  };
}

async function findProcesses(filters, config) {
  const clauses = [];

  if (filters.pid) {
    clauses.push(`if ([int]$_.ProcessId -ne ${filters.pid}) { $ok = $false }`);
  }

  if (filters.name) {
    const literal = psLiteral(filters.name);
    clauses.push([
      `$wantedName = ${literal}`,
      "$candidateName = [string]$_.Name",
      "if (-not ($candidateName -ieq $wantedName -or [IO.Path]::GetFileNameWithoutExtension($candidateName) -ieq $wantedName)) { $ok = $false }",
    ].join("; "));
  }

  if (filters.executable_path) {
    const literal = psLiteral(path.resolve(filters.executable_path));
    clauses.push(`if ($null -eq $_.ExecutablePath -or -not ([string]$_.ExecutablePath -ieq ${literal})) { $ok = $false }`);
  }

  if (filters.command_line_contains) {
    const literal = psLiteral(filters.command_line_contains);
    clauses.push([
      `$needle = ${literal}`,
      "$candidateLine = if ($null -eq $_.CommandLine) { '' } else { [string]$_.CommandLine }",
      "if ($candidateLine.IndexOf($needle, [StringComparison]::OrdinalIgnoreCase) -lt 0) { $ok = $false }",
    ].join("; "));
  }

  const limit = filters.limit ?? 100;
  const rawLimit = limit + 1;
  const body = clauses.length ? clauses.join("; ") : "$ok = $false";

  const script = [
    `$matches = @(Get-CimInstance Win32_Process | Where-Object { $ok = $true; ${body}; $ok } | Select-Object -First ${rawLimit} | ForEach-Object {`,
    `  $p = $_; ${processProjectionScript("$p")}`,
    "})",
    "ConvertTo-Json -InputObject $matches -Compress -Depth 4",
  ].join("\n");

  const parsed = await runPowerShellJson(script, config, 30);
  const items = parsed == null ? [] : Array.isArray(parsed) ? parsed : [parsed];

  return {
    count: Math.min(items.length, limit),
    truncated: items.length > limit,
    processes: items.slice(0, limit),
  };
}

async function waitForProcessIdentity(pid, expectedCreationTime, timeoutSeconds, pollIntervalMs, config) {
  const expectedLiteral = psLiteral(expectedCreationTime);
  const timeoutMs = Math.max(0, timeoutSeconds * 1000);
  const script = [
    `$expected = [DateTimeOffset]::Parse(${expectedLiteral}).UtcDateTime`,
    "$sw = [Diagnostics.Stopwatch]::StartNew()",
    "while ($true) {",
    `  $p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" -ErrorAction SilentlyContinue | Select-Object -First 1`,
    "  if ($null -eq $p) {",
    `    [pscustomobject]@{ pid = ${pid}; exited = $true; timed_out = $false; reason = "not_found"; identity_mismatch = $false; elapsed_ms = [long]$sw.ElapsedMilliseconds } | ConvertTo-Json -Compress`,
    "    break",
    "  }",
    "  $actual = $p.CreationDate.ToUniversalTime()",
    "  if ($actual.Ticks -ne $expected.Ticks) {",
    `    [pscustomobject]@{ pid = ${pid}; exited = $true; timed_out = $false; reason = "pid_reused"; identity_mismatch = $true; expected_creation_time = ${expectedLiteral}; actual_creation_time = $actual.ToString("o"); elapsed_ms = [long]$sw.ElapsedMilliseconds } | ConvertTo-Json -Compress`,
    "    break",
    "  }",
    `  if ($sw.ElapsedMilliseconds -ge ${timeoutMs}) {`,
    `    [pscustomobject]@{ pid = ${pid}; exited = $false; timed_out = $true; reason = "timeout"; identity_mismatch = $false; creation_time = $actual.ToString("o"); elapsed_ms = [long]$sw.ElapsedMilliseconds } | ConvertTo-Json -Compress`,
    "    break",
    "  }",
    `  Start-Sleep -Milliseconds ${pollIntervalMs}`,
    "}",
  ].join("\n");

  return runPowerShellJson(script, config, Math.min(config.shell.maxTimeoutSeconds, timeoutSeconds + 10));
}

async function terminatePid(pid, force, tree, config) {
  const args = ["/PID", String(pid)];
  if (tree) args.push("/T");
  if (force !== false) args.push("/F");
  const quotedArgs = args.map(psLiteral).join(", ");
  const script = [
    `$lconnectArgs = @(${quotedArgs})`,
    '& "$env:SystemRoot\\System32\\taskkill.exe" @lconnectArgs',
    "if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }",
  ].join("; ");

  const result = await runPowerShell(script, {
    timeoutSeconds: 20,
    maxOutputChars: config.shell.maxOutputChars,
  });

  if (result.error) throw new Error(`Failed to launch taskkill: ${result.error}`);
  if (result.timedOut) throw new Error("taskkill timed out.");
  if (result.code) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`taskkill failed (exit ${result.code})${detail ? `: ${detail}` : ""}`);
  }
}

function spawnDetached(program, args, cwd) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(program, args, {
      cwd,
      windowsHide: true,
      detached: true,
      stdio: "ignore",
    });

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    child.once("error", (error) => finish(reject, error));
    child.once("spawn", () => {
      const pid = child.pid;
      child.unref();
      finish(resolve, pid);
    });
  });
}

export function registerProcessAdvancedTools(server, config) {
  const enabled = config.shell.enabled && process.env.MCP_ENABLE_POWERSHELL !== "false";

  const requireEnabled = () => {
    if (!enabled) throw new Error("Advanced process inspection/control requires shell execution to be enabled.");
  };

  server.tool("process_details", "Return structured Windows process details and creation-time identity for one PID.", {
    pid: z.number().int().min(1),
  }, async ({ pid }) => {
    try {
      requireEnabled();
      return textResult(await getProcessDetails(pid, config));
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("process_tree", "Return a process subtree plus ancestors using PID/parent PID relationships.", {
    pid: z.number().int().min(1),
    max_depth: z.number().int().min(0).max(32).optional(),
  }, async ({ pid, max_depth = 8 }) => {
    try {
      requireEnabled();
      const snapshot = await getProcessTreeSnapshot(config);
      const tree = buildTree(snapshot, pid, max_depth);
      if (!tree) return textResult({ found: false, pid });
      return textResult({ found: true, pid, max_depth, ...tree });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("find_process", "Find Windows processes using structured filters.", {
    pid: z.number().int().min(1).optional(),
    name: z.string().min(1).optional(),
    executable_path: z.string().min(1).optional(),
    command_line_contains: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(500).optional(),
  }, async (filters) => {
    try {
      requireEnabled();
      if (!filters.pid && !filters.name && !filters.executable_path && !filters.command_line_contains) {
        return textResult("At least one process filter is required.", true);
      }
      return textResult(await findProcesses(filters, config));
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("wait_process", "Wait a bounded time for a specific process identity to exit. Creation time is required to detect PID reuse.", {
    pid: z.number().int().min(1),
    expected_creation_time: z.string().min(1),
    timeout_seconds: z.number().int().min(0).max(30).optional(),
    poll_interval_ms: z.number().int().min(100).max(2000).optional(),
  }, async ({ pid, expected_creation_time, timeout_seconds = 5, poll_interval_ms = 250 }) => {
    try {
      requireEnabled();
      const current = await getProcessDetails(pid, config);
      if (!current?.found) {
        return textResult({
          pid,
          exited: true,
          timed_out: false,
          reason: "not_found",
          identity_mismatch: false,
          already_exited: true,
          elapsed_ms: 0,
        });
      }

      if (!sameCreationTime(current.process.creation_time, expected_creation_time)) {
        return textResult({
          pid,
          exited: true,
          timed_out: false,
          reason: "pid_reused",
          identity_mismatch: true,
          expected_creation_time,
          actual_creation_time: current.process.creation_time,
          elapsed_ms: 0,
        });
      }

      return textResult(
        await waitForProcessIdentity(
          pid,
          expected_creation_time,
          timeout_seconds,
          poll_interval_ms,
          config
        )
      );
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("restart_process", "Restart an explicitly identified process. Requires creation-time identity and an explicit relaunch program.", {
    pid: z.number().int().min(1),
    expected_creation_time: z.string().min(1),
    program: z.string().min(1),
    args: z.array(z.string()).optional(),
    cwd: z.string().min(1).optional(),
    force: z.boolean().optional(),
    tree: z.boolean().optional(),
    wait_timeout_seconds: z.number().int().min(1).max(15).optional(),
  }, async ({
    pid,
    expected_creation_time,
    program,
    args = [],
    cwd,
    force = true,
    tree = false,
    wait_timeout_seconds = 10,
  }) => {
    try {
      requireEnabled();

      if (pid === process.pid) {
        return textResult("Refusing to restart the LConnect MCP process from inside its own request.", true);
      }

      const current = await getProcessDetails(pid, config);
      if (!current?.found) {
        return textResult({ restarted: false, reason: "not_found", pid }, true);
      }

      if (!sameCreationTime(current.process.creation_time, expected_creation_time)) {
        return textResult({
          restarted: false,
          reason: "pid_reused",
          identity_mismatch: true,
          pid,
          expected_creation_time,
          actual_creation_time: current.process.creation_time,
        }, true);
      }

      const oldIdentity = {
        pid,
        creation_time: current.process.creation_time,
        name: current.process.name,
        executable_path: current.process.executable_path,
      };

      await terminatePid(pid, force, tree, config);

      const waited = await waitForProcessIdentity(
        pid,
        expected_creation_time,
        wait_timeout_seconds,
        200,
        config
      );

      if (!waited.exited) {
        return textResult({
          restarted: false,
          terminated: false,
          reason: "old_process_did_not_exit",
          old_process: oldIdentity,
          wait: waited,
        }, true);
      }

      const resolvedCwd = cwd ? path.resolve(cwd) : undefined;
      let newPid;
      try {
        newPid = await spawnDetached(program, args, resolvedCwd);
      } catch (error) {
        return textResult({
          restarted: false,
          terminated: true,
          reason: "relaunch_failed",
          error: error.message,
          old_process: oldIdentity,
          program,
          args,
          cwd: resolvedCwd ?? null,
        }, true);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
      const newDetails = await getProcessDetails(newPid, config);

      return textResult({
        restarted: true,
        old_process: oldIdentity,
        wait: waited,
        new_pid: newPid,
        new_process: newDetails?.found ? newDetails.process : null,
        program,
        args,
        cwd: resolvedCwd ?? null,
      });
    } catch (error) {
      return textResult(error.message, true);
    }
  });
}
