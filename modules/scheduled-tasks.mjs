import { z } from "zod";
import { runPowerShell } from "./runtime.mjs";

function textResult(value, isError = false) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

function psLiteral(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function normalizeTaskPath(value = "\\") {
  let result = String(value || "\\").replace(/\//g, "\\").trim();
  if (!result.startsWith("\\")) result = "\\" + result;
  if (result !== "\\" && !result.endsWith("\\")) result += "\\";
  return result;
}

function validateTaskPath(value) {
  return !/[\*?\[\]]/.test(value);
}

function validateTaskName(value) {
  return !/[\\/\*?\[\]]/.test(value);
}

async function runPowerShellJson(script, config, timeoutSeconds = 30) {
  const result = await runPowerShell(script, {
    timeoutSeconds: Math.min(timeoutSeconds, config.shell.maxTimeoutSeconds),
    maxOutputChars: config.shell.maxOutputChars,
  });

  if (result.error) throw new Error(`Failed to launch PowerShell: ${result.error}`);
  if (result.timedOut) throw new Error("Scheduled Task operation timed out.");
  if (result.code) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(
      `Scheduled Task operation failed (exit ${result.code})${detail ? `: ${detail}` : ""}`
    );
  }

  const raw = (result.stdout || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse Scheduled Task output as JSON: ${error.message}`);
  }
}

function taskSummaryProjection(variable = "$task") {
  return `[pscustomobject]@{
    task_name = [string]${variable}.TaskName
    task_path = [string]${variable}.TaskPath
    state = [string]${variable}.State
    author = if ($null -eq ${variable}.Author) { $null } else { [string]${variable}.Author }
    description = if ($null -eq ${variable}.Description) { $null } else { [string]${variable}.Description }
    uri = if ($null -eq ${variable}.URI) { $null } else { [string]${variable}.URI }
    enabled = if ($null -eq ${variable}.Settings) { $null } else { [bool]${variable}.Settings.Enabled }
    hidden = if ($null -eq ${variable}.Settings) { $null } else { [bool]${variable}.Settings.Hidden }
    principal_user_id = if ($null -eq ${variable}.Principal) { $null } else { [string]${variable}.Principal.UserId }
    principal_logon_type = if ($null -eq ${variable}.Principal) { $null } else { [string]${variable}.Principal.LogonType }
    principal_run_level = if ($null -eq ${variable}.Principal) { $null } else { [string]${variable}.Principal.RunLevel }
  }`;
}

function getTaskDetailsScript(name, taskPath) {
  const nameLit = psLiteral(name);
  const pathLit = psLiteral(taskPath);
  return [
    `$name = ${nameLit}`,
    `$path = ${pathLit}`,
    "$task = Get-ScheduledTask -TaskName $name -TaskPath $path -ErrorAction SilentlyContinue | Select-Object -First 1",
    "if ($null -eq $task) { [pscustomobject]@{ found = $false; task_name = $name; task_path = $path } | ConvertTo-Json -Compress; exit 0 }",
    "$info = $null",
    "try { $info = Get-ScheduledTaskInfo -TaskName $name -TaskPath $path -ErrorAction Stop } catch {}",
    "$actions = @($task.Actions | ForEach-Object {",
    "  [pscustomobject]@{",
    "    execute = if ($null -eq $_.Execute) { $null } else { [string]$_.Execute }",
    "    arguments = if ($null -eq $_.Arguments) { $null } else { [string]$_.Arguments }",
    "    working_directory = if ($null -eq $_.WorkingDirectory) { $null } else { [string]$_.WorkingDirectory }",
    "  }",
    "})",
    "$triggers = @($task.Triggers | ForEach-Object {",
    "  $r = $_.Repetition",
    "  [pscustomobject]@{",
    "    type = if ($null -eq $_.CimClass) { $null } else { [string]$_.CimClass.CimClassName }",
    "    id = if ($null -eq $_.Id) { $null } else { [string]$_.Id }",
    "    enabled = if ($null -eq $_.Enabled) { $null } else { [bool]$_.Enabled }",
    "    start_boundary = if ($null -eq $_.StartBoundary) { $null } else { [string]$_.StartBoundary }",
    "    end_boundary = if ($null -eq $_.EndBoundary) { $null } else { [string]$_.EndBoundary }",
    "    days_interval = if ($null -eq $_.DaysInterval) { $null } else { [uint32]$_.DaysInterval }",
    "    weeks_interval = if ($null -eq $_.WeeksInterval) { $null } else { [uint32]$_.WeeksInterval }",
    "    days_of_week = if ($null -eq $_.DaysOfWeek) { $null } else { [uint16]$_.DaysOfWeek }",
    "    user_id = if ($null -eq $_.UserId) { $null } else { [string]$_.UserId }",
    "    repetition_interval = if ($null -eq $r -or $null -eq $r.Interval) { $null } else { [string]$r.Interval }",
    "    repetition_duration = if ($null -eq $r -or $null -eq $r.Duration) { $null } else { [string]$r.Duration }",
    "  }",
    "})",
    `$summary = ${taskSummaryProjection("$task")}`,
    "$out = [ordered]@{}",
    "$summary.PSObject.Properties | ForEach-Object { $out[$_.Name] = $_.Value }",
    "$out['actions'] = $actions",
    "$out['triggers'] = $triggers",
    "$out['last_run_time'] = if ($null -eq $info -or $info.LastRunTime -eq [datetime]::MinValue) { $null } else { $info.LastRunTime.ToUniversalTime().ToString('o') }",
    "$out['next_run_time'] = if ($null -eq $info -or $info.NextRunTime -eq [datetime]::MinValue) { $null } else { $info.NextRunTime.ToUniversalTime().ToString('o') }",
    "$out['last_task_result'] = if ($null -eq $info) { $null } else { [int64]$info.LastTaskResult }",
    "$out['missed_runs'] = if ($null -eq $info) { $null } else { [uint32]$info.NumberOfMissedRuns }",
    "[pscustomobject]@{ found = $true; task = [pscustomobject]$out } | ConvertTo-Json -Compress -Depth 7",
  ].join("\n");
}

async function getTaskDetails(name, taskPath, config) {
  return runPowerShellJson(getTaskDetailsScript(name, taskPath), config, 25);
}

async function listTasks(filters, config) {
  const pathFilter = filters.task_path ? normalizeTaskPath(filters.task_path) : null;
  const nameContains = filters.name_contains ?? null;
  const state = filters.state ?? null;
  const limit = filters.limit ?? 200;
  const rawLimit = limit + 1;

  const clauses = [];
  if (pathFilter) {
    clauses.push(`if (-not ([string]$_.TaskPath -ieq ${psLiteral(pathFilter)})) { $ok = $false }`);
  }
  if (nameContains) {
    clauses.push([
      `$needle = ${psLiteral(nameContains)}`,
      "$n = [string]$_.TaskName",
      "if ($n.IndexOf($needle, [StringComparison]::OrdinalIgnoreCase) -lt 0) { $ok = $false }",
    ].join("; "));
  }
  if (state) {
    clauses.push(`if (-not ([string]$_.State -ieq ${psLiteral(state)})) { $ok = $false }`);
  }
  const body = clauses.length ? clauses.join("; ") : "";

  const script = [
    `$items = @(Get-ScheduledTask -ErrorAction Stop | Where-Object { $ok = $true; ${body}; $ok } | Sort-Object TaskPath,TaskName | Select-Object -First ${rawLimit} | ForEach-Object {`,
    `  $task = $_; ${taskSummaryProjection("$task")}`,
    "})",
    "ConvertTo-Json -InputObject $items -Compress -Depth 5",
  ].join("\n");

  const parsed = await runPowerShellJson(script, config, 40);
  const items = parsed == null ? [] : Array.isArray(parsed) ? parsed : [parsed];
  return {
    count: Math.min(items.length, limit),
    truncated: items.length > limit,
    tasks: items.slice(0, limit),
  };
}

function ensureTaskFolderScript(taskPath) {
  if (taskPath === "\\") return "";
  return [
    "$scheduler = New-Object -ComObject Schedule.Service",
    "$scheduler.Connect()",
    "$folder = $scheduler.GetFolder('\\')",
    `$segments = @(${psLiteral(taskPath.trim().replace(/^\\+|\\+$/g, ""))}.Split('\\') | Where-Object { $_ })`,
    "foreach ($segment in $segments) {",
    "  $nextPath = if ($folder.Path -eq '\\') { '\\' + $segment } else { $folder.Path + '\\' + $segment }",
    "  try { $folder = $scheduler.GetFolder($nextPath) } catch { $folder = $folder.CreateFolder($segment) }",
    "}",
  ].join("\n");
}

function triggerScript(type, at, dailyIntervalDays, logonUser) {
  if (type === "once") {
    return [
      `$at = [DateTimeOffset]::Parse(${psLiteral(at)}).LocalDateTime`,
      "$trigger = New-ScheduledTaskTrigger -Once -At $at",
    ].join("\n");
  }
  if (type === "daily") {
    return [
      `$at = [DateTimeOffset]::Parse(${psLiteral(at)}).LocalDateTime`,
      `$trigger = New-ScheduledTaskTrigger -Daily -At $at -DaysInterval ${dailyIntervalDays}`,
    ].join("\n");
  }
  if (type === "at_startup") {
    return "$trigger = New-ScheduledTaskTrigger -AtStartup";
  }
  if (type === "at_logon") {
    return logonUser
      ? `$trigger = New-ScheduledTaskTrigger -AtLogOn -User ${psLiteral(logonUser)}`
      : "$trigger = New-ScheduledTaskTrigger -AtLogOn";
  }
  throw new Error(`Unsupported trigger type: ${type}`);
}

async function createTask(args, config) {
  const taskPath = normalizeTaskPath(args.task_path);
  const existing = await getTaskDetails(args.task_name, taskPath, config);
  if (existing?.found && !args.force) {
    throw new Error(`Scheduled task already exists: ${taskPath}${args.task_name}`);
  }

  if (["once", "daily"].includes(args.trigger_type) && !args.at) {
    throw new Error(`at is required for trigger_type=${args.trigger_type}`);
  }

  const working = args.working_directory
    ? ` -WorkingDirectory ${psLiteral(args.working_directory)}`
    : "";
  const argumentsPart = args.arguments != null
    ? ` -Argument ${psLiteral(args.arguments)}`
    : "";
  const description = args.description ?? "Created by LConnect";
  const runLevel = args.run_level === "highest" ? "Highest" : "Limited";
  const forcePart = args.force ? " -Force" : "";

  const script = [
    "$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name",
    ensureTaskFolderScript(taskPath),
    `$action = New-ScheduledTaskAction -Execute ${psLiteral(args.executable)}${argumentsPart}${working}`,
    triggerScript(args.trigger_type, args.at, args.daily_interval_days ?? 1, args.logon_user),
    `$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel ${runLevel}`,
    "$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries",
    `Register-ScheduledTask -TaskName ${psLiteral(args.task_name)} -TaskPath ${psLiteral(taskPath)} -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description ${psLiteral(description)}${forcePart} -ErrorAction Stop | Out-Null`,
    getTaskDetailsScript(args.task_name, taskPath),
  ].filter(Boolean).join("\n");

  return runPowerShellJson(script, config, 45);
}

async function mutateTask(name, taskPath, action, config) {
  const normalized = normalizeTaskPath(taskPath);
  const before = await getTaskDetails(name, normalized, config);
  if (!before?.found) {
    return { ok: false, reason: "not_found", task_name: name, task_path: normalized };
  }

  const cmd = {
    run: "Start-ScheduledTask",
    stop: "Stop-ScheduledTask",
    enable: "Enable-ScheduledTask",
    disable: "Disable-ScheduledTask",
    delete: "Unregister-ScheduledTask",
  }[action];
  if (!cmd) throw new Error(`Unsupported task action: ${action}`);

  const confirm = action === "delete" ? " -Confirm:$false" : "";
  const script = [
    `${cmd} -TaskName ${psLiteral(name)} -TaskPath ${psLiteral(normalized)}${confirm} -ErrorAction Stop | Out-Null`,
    action === "delete"
      ? `[pscustomobject]@{ ok = $true; action = 'delete'; task_name = ${psLiteral(name)}; task_path = ${psLiteral(normalized)}; deleted = $true } | ConvertTo-Json -Compress`
      : [
          "Start-Sleep -Milliseconds 100",
          getTaskDetailsScript(name, normalized),
        ].join("\n"),
  ].join("\n");

  const after = await runPowerShellJson(script, config, 30);
  if (action === "delete") return after;
  return {
    ok: true,
    action,
    before: before.task,
    after: after?.task ?? null,
  };
}

export function registerScheduledTaskTools(server, config) {
  const enabled =
    process.platform === "win32" &&
    config.shell.enabled &&
    process.env.MCP_ENABLE_POWERSHELL !== "false";

  const requireEnabled = () => {
    if (!enabled) {
      throw new Error("Scheduled Task tools require Windows and shell execution to be enabled.");
    }
  };

  const taskNameSchema = z.string().min(1).max(238).refine(validateTaskName, "Task name must not contain path separators or wildcard characters.");
  const taskPathSchema = z.string().min(1).refine(validateTaskPath, "Task path must not contain wildcard characters.");

  server.tool("list_scheduled_tasks", "List Windows Scheduled Tasks with bounded structured output.", {
    task_path: taskPathSchema.optional(),
    name_contains: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(2000).optional(),
  }, async (filters) => {
    try {
      requireEnabled();
      return textResult(await listTasks(filters, config));
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("get_scheduled_task", "Read one Windows Scheduled Task by exact task_path + task_name.", {
    task_name: taskNameSchema,
    task_path: taskPathSchema.optional(),
  }, async ({ task_name, task_path = "\\" }) => {
    try {
      requireEnabled();
      return textResult(await getTaskDetails(task_name, normalizeTaskPath(task_path), config));
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("create_scheduled_task", "Create a Windows Scheduled Task for the current LConnect Windows user.", {
    task_name: taskNameSchema,
    task_path: taskPathSchema.optional(),
    executable: z.string().min(1),
    arguments: z.string().optional(),
    working_directory: z.string().min(1).optional(),
    description: z.string().optional(),
    trigger_type: z.enum(["once", "daily", "at_startup", "at_logon"]),
    at: z.string().min(1).optional(),
    daily_interval_days: z.number().int().min(1).max(365).optional(),
    logon_user: z.string().min(1).optional(),
    run_level: z.enum(["limited", "highest"]).optional(),
    force: z.boolean().optional(),
  }, async (args) => {
    try {
      requireEnabled();
      const result = await createTask({
        task_path: "\\",
        daily_interval_days: 1,
        run_level: "limited",
        force: false,
        ...args,
      }, config);
      return textResult(result);
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  const identitySchema = {
    task_name: taskNameSchema,
    task_path: taskPathSchema.optional(),
  };

  for (const [toolName, action, description] of [
    ["run_scheduled_task", "run", "Run one Windows Scheduled Task by exact identity."],
    ["stop_scheduled_task", "stop", "Stop one Windows Scheduled Task by exact identity."],
    ["enable_scheduled_task", "enable", "Enable one Windows Scheduled Task by exact identity."],
    ["disable_scheduled_task", "disable", "Disable one Windows Scheduled Task by exact identity."],
    ["delete_scheduled_task", "delete", "Delete one Windows Scheduled Task by exact identity without wildcard matching."],
  ]) {
    server.tool(toolName, description, identitySchema, async ({ task_name, task_path = "\\" }) => {
      try {
        requireEnabled();
        const result = await mutateTask(task_name, task_path, action, config);
        return textResult(result, result?.ok === false);
      } catch (error) {
        return textResult(error.message, true);
      }
    });
  }
}
