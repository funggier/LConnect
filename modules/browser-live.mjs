import { randomUUID } from "node:crypto";
import { z } from "zod";
import { runProcess } from "./runtime.mjs";

const MAX_LIVE_SESSIONS = 16;

function liveError(code, message) {
  const error = new Error(code + ": " + message);
  error.code = code;
  return error;
}

function textResult(value, isError = false) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

const UIA_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "Add-Type -AssemblyName UIAutomationClient",
  "Add-Type -AssemblyName UIAutomationTypes",
  "$json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:LCONNECT_BROWSER_LIVE_PAYLOAD))",
  "$payload = $json | ConvertFrom-Json",
  "function Hwnd-Text([IntPtr]$h) { if($h -eq [IntPtr]::Zero){return $null}; return ('0x{0:X}' -f $h.ToInt64()) }",
  "function Control-Type($e) { return $e.Current.ControlType.ProgrammaticName.Replace('ControlType.','') }",
  "function Safe-Number([double]$v) { if([double]::IsNaN($v) -or [double]::IsInfinity($v)){return $null}; return [double]$v }",
  "function Get-BrowserRoot {",
  "  $name = if($payload.browser -eq 'firefox'){'firefox'}elseif($payload.browser -eq 'chrome'){'chrome'}else{throw 'LIVE_BROWSER_UNSUPPORTED'}",
  "  $items = @(Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })",
  "  if($null -ne $payload.pid){ $items = @($items | Where-Object { $_.Id -eq [int]$payload.pid }) }",
  "  if($items.Count -eq 0){ throw 'LIVE_BROWSER_NOT_FOUND' }",
  "  $p = $items | Sort-Object StartTime | Select-Object -First 1",
  "  $root = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$p.MainWindowHandle)",
  "  if($null -eq $root){ throw 'LIVE_BROWSER_UIA_ROOT_UNAVAILABLE' }",
  "  return [pscustomobject]@{ process=$p; root=$root }",
  "}",
  "function Find-Target($root) {",
  "  $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)",
  "  $wanted = if($null -eq $payload.occurrence){0}else{[int]$payload.occurrence}",
  "  $seen = 0",
  "  for($i=0;$i -lt $all.Count;$i++){",
  "    $e=$all.Item($i)",
  "    $name=[string]$e.Current.Name",
  "    $aid=[string]$e.Current.AutomationId",
  "    $type=Control-Type $e",
  "    if($null -ne $payload.control_type -and [string]$payload.control_type -ne '' -and $type -ne [string]$payload.control_type){continue}",
  "    if($null -ne $payload.automation_id -and [string]$payload.automation_id -ne '' -and $aid -ne [string]$payload.automation_id){continue}",
  "    if($null -ne $payload.name -and [string]$payload.name -ne ''){",
  "      if([bool]$payload.exact){ if($name -ne [string]$payload.name){continue} }",
  "      else { if($name.IndexOf([string]$payload.name,[StringComparison]::OrdinalIgnoreCase) -lt 0){continue} }",
  "    }",
  "    if($seen -eq $wanted){return $e}",
  "    $seen++",
  "  }",
  "  return $null",
  "}",
  "$ctx = Get-BrowserRoot",
  "$p = $ctx.process",
  "$root = $ctx.root",
  "switch([string]$payload.operation){",
  "  'attach' {",
  "    [pscustomobject]@{ pid=[int]$p.Id; hwnd=Hwnd-Text([IntPtr]$p.MainWindowHandle); title=[string]$root.Current.Name; process_name=[string]$p.ProcessName; backend='windows-uia'; remote_automation=$false; profile_access='none' } | ConvertTo-Json -Compress -Depth 6",
  "  }",
  "  'tabs' {",
  "    $cond=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::TabItem)",
  "    $tabs=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,$cond)",
  "    $out=@()",
  "    for($i=0;$i -lt $tabs.Count;$i++){",
  "      $e=$tabs.Item($i)",
  "      $selected=$e.GetCurrentPropertyValue([System.Windows.Automation.SelectionItemPattern]::IsSelectedProperty,$true)",
  "      $out += [pscustomobject]@{ index=$i; name=[string]$e.Current.Name; selected=($selected -eq $true); enabled=[bool]$e.Current.IsEnabled; automation_id=[string]$e.Current.AutomationId }",
  "    }",
  "    [pscustomobject]@{ tabs=$out; count=$out.Count } | ConvertTo-Json -Compress -Depth 6",
  "  }",
  "  'snapshot' {",
  "    $max=[Math]::Max(1,[Math]::Min(500,[int]$payload.max_elements))",
  "    $all=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)",
  "    $out=@()",
  "    for($i=0;$i -lt $all.Count -and $out.Count -lt $max;$i++){",
  "      $e=$all.Item($i)",
  "      $name=[string]$e.Current.Name",
  "      $aid=[string]$e.Current.AutomationId",
  "      $type=Control-Type $e",
  "      if($null -ne $payload.name_contains -and [string]$payload.name_contains -ne '' -and $name.IndexOf([string]$payload.name_contains,[StringComparison]::OrdinalIgnoreCase) -lt 0){continue}",
  "      if([string]::IsNullOrWhiteSpace($name) -and [string]::IsNullOrWhiteSpace($aid)){continue}",
  "      $r=$e.Current.BoundingRectangle",
  "      $out += [pscustomobject]@{ index=$i; control_type=$type; name=$name; automation_id=$aid; enabled=[bool]$e.Current.IsEnabled; focus=[bool]$e.Current.HasKeyboardFocus; offscreen=[bool]$e.Current.IsOffscreen; bounds=[pscustomobject]@{ x=Safe-Number([double]$r.X); y=Safe-Number([double]$r.Y); width=Safe-Number([double]$r.Width); height=Safe-Number([double]$r.Height) } }",
  "    }",
  "    [pscustomobject]@{ title=[string]$root.Current.Name; pid=[int]$p.Id; elements=$out; returned=$out.Count; truncated=($out.Count -ge $max) } | ConvertTo-Json -Compress -Depth 8",
  "  }",
  "  'click' {",
  "    $e=Find-Target $root",
  "    if($null -eq $e){throw 'LIVE_TARGET_NOT_FOUND'}",
  "    if(-not $e.Current.IsEnabled){throw 'LIVE_TARGET_DISABLED'}",
  "    $pattern=$null",
  "    $action=$null",
  "    if($e.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$pattern)){ $pattern.Invoke(); $action='invoke' }",
  "    elseif($e.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern,[ref]$pattern)){ $pattern.Select(); $action='select' }",
  "    elseif($e.TryGetCurrentPattern([System.Windows.Automation.LegacyIAccessiblePattern]::Pattern,[ref]$pattern)){ $pattern.DoDefaultAction(); $action='legacy-default' }",
  "    else{throw 'LIVE_TARGET_NOT_INVOKABLE'}",
  "    [pscustomobject]@{ clicked=$true; action=$action; name=[string]$e.Current.Name; control_type=Control-Type($e); automation_id=[string]$e.Current.AutomationId } | ConvertTo-Json -Compress -Depth 6",
  "  }",
  "  'type' {",
  "    $e=Find-Target $root",
  "    if($null -eq $e){throw 'LIVE_TARGET_NOT_FOUND'}",
  "    $pattern=$null",
  "    if(-not $e.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern,[ref]$pattern)){throw 'LIVE_TARGET_NOT_VALUE_EDITABLE'}",
  "    if($pattern.Current.IsReadOnly){throw 'LIVE_TARGET_READ_ONLY'}",
  "    $before=[string]$pattern.Current.Value",
  "    $after=if([bool]$payload.clear){[string]$payload.text}else{$before+[string]$payload.text}",
  "    $pattern.SetValue($after)",
  "    [pscustomobject]@{ typed=$true; name=[string]$e.Current.Name; control_type=Control-Type($e); automation_id=[string]$e.Current.AutomationId; chars=([string]$payload.text).Length; cleared=[bool]$payload.clear; value=$after } | ConvertTo-Json -Compress -Depth 6",
  "  }",
  "  default { throw 'LIVE_OPERATION_UNSUPPORTED' }",
  "}"
].join("\n");

async function runUia(operation, payload, config) {
  if (process.platform !== "win32") {
    throw liveError("LIVE_BROWSER_WINDOWS_ONLY", "Live browser UI Automation is available only on Windows.");
  }
  const encoded = Buffer.from(JSON.stringify({ ...payload, operation }), "utf8").toString("base64");
  const env = { ...process.env, LCONNECT_BROWSER_LIVE_PAYLOAD: encoded };
  const result = await runProcess(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", UIA_SCRIPT],
    {
      timeoutSeconds: Math.min(12, config?.shell?.maxTimeoutSeconds ?? 12),
      maxOutputChars: Math.max(32768, Math.min(config?.shell?.maxOutputChars ?? 250000, 1000000)),
      env,
    }
  );
  if (result.error) throw liveError("LIVE_BROWSER_WORKER_FAILED", result.error);
  if (result.timedOut) throw liveError("LIVE_BROWSER_TIMEOUT", "Windows UI Automation worker timed out.");
  if (result.code) {
    const detail = String(result.stderr || result.stdout || "").trim();
    const known = detail.match(/(LIVE_[A-Z0-9_]+)/)?.[1] || "LIVE_BROWSER_UIA_FAILED";
    throw liveError(known, detail || "Windows UI Automation worker failed.");
  }
  const raw = String(result.stdout || "").trim();
  if (!raw) throw liveError("LIVE_BROWSER_UIA_PROTOCOL_ERROR", "Windows UI Automation worker returned no result.");
  try { return JSON.parse(raw); }
  catch (error) { throw liveError("LIVE_BROWSER_UIA_PROTOCOL_ERROR", "Invalid JSON from Windows UI Automation worker: " + error.message); }
}

export class BrowserLiveLayer {
  constructor({ runner = runUia, maxSessions = MAX_LIVE_SESSIONS, config = null } = {}) {
    this.runner = runner;
    this.maxSessions = maxSessions;
    this.config = config;
    this.sessions = new Map();
  }

  _require(id) {
    const record = this.sessions.get(id);
    if (!record) throw liveError("LIVE_BROWSER_SESSION_NOT_FOUND", "Unknown browser_live_session_id: " + id + ".");
    return record;
  }

  async attach({ browser, pid = null }) {
    if (this.sessions.size >= this.maxSessions) {
      throw liveError("LIVE_BROWSER_SESSION_LIMIT", "Live browser session limit reached (" + this.maxSessions + ").");
    }
    const result = await this.runner("attach", { browser, pid }, this.config);
    const id = "browser-live-" + randomUUID();
    const record = {
      id,
      browser,
      pid: result.pid,
      hwnd: result.hwnd,
      createdAt: new Date().toISOString(),
    };
    this.sessions.set(id, record);
    return {
      ok: true,
      session: {
        browser_live_session_id: id,
        browser,
        mode: "live",
        backend: "windows-uia",
        created_at: record.createdAt,
        remote_automation: false,
        profile_access: "none",
      },
      result,
    };
  }

  async tabs({ browser_live_session_id }) {
    const record = this._require(browser_live_session_id);
    const result = await this.runner("tabs", record, this.config);
    return { ok: true, browser_live_session_id, browser: record.browser, result };
  }

  async snapshot({ browser_live_session_id, max_elements = 200, name_contains = null }) {
    const record = this._require(browser_live_session_id);
    const result = await this.runner("snapshot", { ...record, max_elements, name_contains }, this.config);
    return { ok: true, browser_live_session_id, browser: record.browser, result };
  }

  async click({ browser_live_session_id, name = null, automation_id = null, control_type = null, exact = true, occurrence = 0 }) {
    const record = this._require(browser_live_session_id);
    const result = await this.runner("click", {
      ...record, name, automation_id, control_type, exact, occurrence,
    }, this.config);
    return { ok: true, browser_live_session_id, browser: record.browser, result };
  }

  async type({ browser_live_session_id, name = null, automation_id = null, control_type = "Edit", exact = true, occurrence = 0, text = "", clear = false }) {
    const record = this._require(browser_live_session_id);
    const result = await this.runner("type", {
      ...record, name, automation_id, control_type, exact, occurrence, text, clear,
    }, this.config);
    return { ok: true, browser_live_session_id, browser: record.browser, result };
  }

  stop({ browser_live_session_id }) {
    const record = this._require(browser_live_session_id);
    this.sessions.delete(browser_live_session_id);
    return {
      ok: true,
      browser_live_session_id,
      browser: record.browser,
      result: { stopped: true, detached_only: true, browser_process_untouched: true, remote_automation: false },
    };
  }
}

export function registerBrowserLiveTools(server, config, layer = new BrowserLiveLayer({ config })) {
  const browserSchema = z.enum(["firefox", "chrome"]);
  const sessionSchema = z.string().min(1).max(128);
  const selectorFields = {
    name: z.string().max(1024).optional(),
    automation_id: z.string().max(1024).optional(),
    control_type: z.string().min(1).max(64).optional(),
    exact: z.boolean().optional(),
    occurrence: z.number().int().min(0).max(1000).optional(),
  };

  server.tool("browser_live_attach", "Attach semantically to a currently open Firefox/Chrome window using Windows UI Automation only. No WebDriver/CDP or profile mutation is enabled.", {
    browser: browserSchema,
    pid: z.number().int().min(1).optional(),
  }, async (args) => {
    try { return textResult(await layer.attach(args)); }
    catch (error) { return textResult(error.message, true); }
  });

  server.tool("browser_live_tabs", "List visible browser tab UI items through Windows UI Automation.", {
    browser_live_session_id: sessionSchema,
  }, async (args) => {
    try { return textResult(await layer.tabs(args)); }
    catch (error) { return textResult(error.message, true); }
  });

  server.tool("browser_live_snapshot", "Return a bounded Windows UI Automation snapshot from an attached live browser window.", {
    browser_live_session_id: sessionSchema,
    max_elements: z.number().int().min(1).max(500).optional(),
    name_contains: z.string().max(1024).optional(),
  }, async (args) => {
    try { return textResult(await layer.snapshot(args)); }
    catch (error) { return textResult(error.message, true); }
  });

  server.tool("browser_live_click", "Invoke/select a live browser accessibility element without enabling browser remote automation.", {
    browser_live_session_id: sessionSchema,
    ...selectorFields,
  }, async (args) => {
    if (!args.name && !args.automation_id) return textResult("LIVE_TARGET_SELECTOR_REQUIRED: name or automation_id is required.", true);
    try { return textResult(await layer.click(args)); }
    catch (error) { return textResult(error.message, true); }
  });

  server.tool("browser_live_type", "Set text through UI Automation ValuePattern on a live browser accessibility element; no WebDriver/CDP is used.", {
    browser_live_session_id: sessionSchema,
    ...selectorFields,
    text: z.string().max(200000),
    clear: z.boolean().optional(),
  }, async (args) => {
    if (!args.name && !args.automation_id) return textResult("LIVE_TARGET_SELECTOR_REQUIRED: name or automation_id is required.", true);
    try { return textResult(await layer.type(args)); }
    catch (error) { return textResult(error.message, true); }
  });

  server.tool("browser_live_stop", "Detach the LConnect live-browser session only. The browser process and profile are never closed or modified.", {
    browser_live_session_id: sessionSchema,
  }, async (args) => {
    try { return textResult(layer.stop(args)); }
    catch (error) { return textResult(error.message, true); }
  });

  return layer;
}
