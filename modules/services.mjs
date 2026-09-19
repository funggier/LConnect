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

  if (result.error) throw new Error(`Failed to launch PowerShell: ${result.error}`);
  if (result.timedOut) throw new Error("Windows service operation timed out.");
  if (result.code) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`Windows service operation failed (exit ${result.code})${detail ? `: ${detail}` : ""}`);
  }

  const raw = (result.stdout || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse Windows service output as JSON: ${error.message}`);
  }
}

function summaryProjection(variable = "$s") {
  return `[pscustomobject]@{
    name = [string]${variable}.Name
    display_name = [string]${variable}.DisplayName
    state = [string]${variable}.State
    start_mode = [string]${variable}.StartMode
    started = [bool]${variable}.Started
    process_id = [int]${variable}.ProcessId
    service_type = [string]${variable}.ServiceType
    start_name = if ($null -eq ${variable}.StartName) { $null } else { [string]${variable}.StartName }
    exit_code = [uint32]${variable}.ExitCode
  }`;
}

async function getServiceDetails(name, config) {
  const literal = psLiteral(name);
  const script = [
    `$name = ${literal}`,
    "$cim = Get-CimInstance Win32_Service | Where-Object { $_.Name -ieq $name } | Select-Object -First 1",
    "if ($null -eq $cim) { [pscustomobject]@{ found = $false; name = $name } | ConvertTo-Json -Compress; exit 0 }",
    "$svc = Get-Service | Where-Object { $_.Name -ieq $cim.Name } | Select-Object -First 1",
    "$delayed = $false",
    "try { $reg = Get-ItemProperty -LiteralPath ('HKLM:\\SYSTEM\\CurrentControlSet\\Services\\' + $cim.Name) -ErrorAction Stop; $delayed = ([int]$reg.DelayedAutoStart -eq 1) } catch { $delayed = $false }",
    `$base = ${summaryProjection("$cim")}`,
    "$item = [ordered]@{}",
    "$base.PSObject.Properties | ForEach-Object { $item[$_.Name] = $_.Value }",
    "$item['delayed_auto_start'] = [bool]$delayed",
    "$item['can_stop'] = if ($null -eq $svc) { $null } else { [bool]$svc.CanStop }",
    "$item['can_pause_and_continue'] = if ($null -eq $svc) { $null } else { [bool]$svc.CanPauseAndContinue }",
    "$item['dependencies'] = if ($null -eq $svc) { @() } else { @($svc.ServicesDependedOn | ForEach-Object { $_.Name }) }",
    "$item['dependent_services'] = if ($null -eq $svc) { @() } else { @($svc.DependentServices | ForEach-Object { $_.Name }) }",
    "[pscustomobject]@{ found = $true; service = [pscustomobject]$item } | ConvertTo-Json -Compress -Depth 5",
  ].join("; ");

  return runPowerShellJson(script, config, 25);
}

async function listServices(filters, config) {
  const clauses = [];

  if (filters.name_contains) {
    const literal = psLiteral(filters.name_contains);
    clauses.push([
      `$needle = ${literal}`,
      "$candidateName = [string]$_.Name",
      "$candidateDisplay = [string]$_.DisplayName",
      "if ($candidateName.IndexOf($needle, [StringComparison]::OrdinalIgnoreCase) -lt 0 -and $candidateDisplay.IndexOf($needle, [StringComparison]::OrdinalIgnoreCase) -lt 0) { $ok = $false }",
    ].join("; "));
  }

  if (filters.state) {
    clauses.push(`if (-not ([string]$_.State -ieq ${psLiteral(filters.state)})) { $ok = $false }`);
  }

  if (filters.start_mode) {
    clauses.push(`if (-not ([string]$_.StartMode -ieq ${psLiteral(filters.start_mode)})) { $ok = $false }`);
  }

  const body = clauses.length ? clauses.join("; ") : "";
  const limit = filters.limit ?? 200;
  const rawLimit = limit + 1;

  const script = [
    `$items = @(Get-CimInstance Win32_Service | Where-Object { $ok = $true; ${body}; $ok } | Sort-Object Name | Select-Object -First ${rawLimit} | ForEach-Object {`,
    `  $s = $_; ${summaryProjection("$s")}`,
    "})",
    "ConvertTo-Json -InputObject $items -Compress -Depth 4",
  ].join("\n");

  const parsed = await runPowerShellJson(script, config, 30);
  const items = parsed == null ? [] : Array.isArray(parsed) ? parsed : [parsed];

  return {
    count: Math.min(items.length, limit),
    truncated: items.length > limit,
    services: items.slice(0, limit),
  };
}

async function runServiceLifecycleAction(name, action, force, timeoutSeconds, config) {
  const literal = psLiteral(name);
  const forceLiteral = force ? "$true" : "$false";
  let actionScript;

  if (action === "start") {
    actionScript = [
      "if ($svc.Status -eq [ServiceProcess.ServiceControllerStatus]::Running) {",
      "  $changed = $false",
      "} else {",
      "  $svc.Start()",
      "  $changed = $true",
      "}",
      "$svc.WaitForStatus([ServiceProcess.ServiceControllerStatus]::Running, [TimeSpan]::FromSeconds($timeout))",
    ].join("\n");
  } else if (action === "stop") {
    actionScript = [
      "if ($svc.Status -eq [ServiceProcess.ServiceControllerStatus]::Stopped) {",
      "  $changed = $false",
      "} else {",
      `  Stop-Service -InputObject $svc -Force:${forceLiteral} -ErrorAction Stop`,
      "  $changed = $true",
      "}",
      "$svc.WaitForStatus([ServiceProcess.ServiceControllerStatus]::Stopped, [TimeSpan]::FromSeconds($timeout))",
    ].join("\n");
  } else if (action === "restart") {
    actionScript = [
      "if ($svc.Status -eq [ServiceProcess.ServiceControllerStatus]::Stopped) {",
      "  $svc.Start()",
      "  $actionTaken = 'started'",
      "} else {",
      `  Restart-Service -InputObject $svc -Force:${forceLiteral} -ErrorAction Stop`,
      "  $actionTaken = 'restarted'",
      "}",
      "$changed = $true",
      "$svc.WaitForStatus([ServiceProcess.ServiceControllerStatus]::Running, [TimeSpan]::FromSeconds($timeout))",
    ].join("\n");
  } else {
    throw new Error(`Unsupported service lifecycle action: ${action}`);
  }

  const script = [
    `$name = ${literal}`,
    `$timeout = ${timeoutSeconds}`,
    "$svc = Get-Service | Where-Object { $_.Name -ieq $name } | Select-Object -First 1",
    "if ($null -eq $svc) { Write-Error ('Service not found: ' + $name); exit 2 }",
    "$before = [string]$svc.Status",
    "$changed = $false",
    "$actionTaken = " + psLiteral(action),
    actionScript,
    "$svc.Refresh()",
    "[pscustomobject]@{ ok = $true; name = $svc.Name; action = $actionTaken; changed = [bool]$changed; before_status = $before; after_status = [string]$svc.Status } | ConvertTo-Json -Compress",
  ].join("\n");

  return runPowerShellJson(script, config, Math.min(config.shell.maxTimeoutSeconds, timeoutSeconds + 10));
}

async function setServiceStartup(name, startupType, config) {
  const map = {
    automatic: "auto",
    automatic_delayed: "delayed-auto",
    manual: "demand",
    disabled: "disabled",
  };
  const scValue = map[startupType];
  const literal = psLiteral(name);

  const script = [
    `$name = ${literal}`,
    "$svc = Get-Service | Where-Object { $_.Name -ieq $name } | Select-Object -First 1",
    "if ($null -eq $svc) { Write-Error ('Service not found: ' + $name); exit 2 }",
    `$output = & "$env:SystemRoot\\System32\\sc.exe" config $svc.Name "start=" "${scValue}" 2>&1`,
    "if ($LASTEXITCODE -ne 0) { Write-Error ($output -join [Environment]::NewLine); exit $LASTEXITCODE }",
    "[pscustomobject]@{ ok = $true; name = $svc.Name; requested_startup_type = " + psLiteral(startupType) + "; sc_output = ($output -join [Environment]::NewLine) } | ConvertTo-Json -Compress",
  ].join("\n");

  return runPowerShellJson(script, config, 20);
}

export function registerServiceTools(server, config) {
  const enabled = config.shell.enabled && process.env.MCP_ENABLE_POWERSHELL !== "false";

  const requireEnabled = () => {
    if (!enabled) throw new Error("Windows service inspection/control requires shell execution to be enabled.");
  };

  server.tool("list_services", "List Windows services with structured state/startup information.", {
    name_contains: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
    start_mode: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  }, async (filters) => {
    try {
      requireEnabled();
      return textResult(await listServices(filters, config));
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("get_service", "Get one Windows service by exact service Name.", {
    name: z.string().min(1),
  }, async ({ name }) => {
    try {
      requireEnabled();
      return textResult(await getServiceDetails(name, config));
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("start_service", "Start one Windows service selected by exact service Name and wait for Running state.", {
    name: z.string().min(1),
    wait_timeout_seconds: z.number().int().min(1).max(60).optional(),
  }, async ({ name, wait_timeout_seconds = 20 }) => {
    try {
      requireEnabled();
      const before = await getServiceDetails(name, config);
      if (!before?.found) return textResult({ started: false, reason: "not_found", name }, true);

      const action = await runServiceLifecycleAction(name, "start", false, wait_timeout_seconds, config);
      const after = await getServiceDetails(name, config);
      return textResult({ started: true, action, before: before.service, after: after?.service ?? null });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("stop_service", "Stop one Windows service selected by exact service Name and wait for Stopped state.", {
    name: z.string().min(1),
    force: z.boolean().optional(),
    wait_timeout_seconds: z.number().int().min(1).max(60).optional(),
  }, async ({ name, force = false, wait_timeout_seconds = 20 }) => {
    try {
      requireEnabled();
      const before = await getServiceDetails(name, config);
      if (!before?.found) return textResult({ stopped: false, reason: "not_found", name }, true);

      const action = await runServiceLifecycleAction(name, "stop", force, wait_timeout_seconds, config);
      const after = await getServiceDetails(name, config);
      return textResult({ stopped: true, action, before: before.service, after: after?.service ?? null });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("restart_service", "Restart one Windows service selected by exact service Name. A stopped service is started.", {
    name: z.string().min(1),
    force: z.boolean().optional(),
    wait_timeout_seconds: z.number().int().min(1).max(60).optional(),
  }, async ({ name, force = false, wait_timeout_seconds = 30 }) => {
    try {
      requireEnabled();
      const before = await getServiceDetails(name, config);
      if (!before?.found) return textResult({ restarted: false, reason: "not_found", name }, true);

      const action = await runServiceLifecycleAction(name, "restart", force, wait_timeout_seconds, config);
      const after = await getServiceDetails(name, config);
      return textResult({ restarted: true, action, before: before.service, after: after?.service ?? null });
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("set_service_startup", "Set Windows service startup mode by exact service Name.", {
    name: z.string().min(1),
    startup_type: z.enum(["automatic", "automatic_delayed", "manual", "disabled"]),
  }, async ({ name, startup_type }) => {
    try {
      requireEnabled();
      const before = await getServiceDetails(name, config);
      if (!before?.found) return textResult({ changed: false, reason: "not_found", name }, true);

      const action = await setServiceStartup(name, startup_type, config);
      const after = await getServiceDetails(name, config);
      return textResult({
        changed: true,
        requested_startup_type: startup_type,
        action,
        before: before.service,
        after: after?.service ?? null,
      });
    } catch (error) {
      return textResult(error.message, true);
    }
  });
}
