import { z } from "zod";
import { runProcess } from "./runtime.mjs";

function textResult(value, isError = false) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

const hwndSchema = z.string().regex(/^(?:0x[0-9a-fA-F]+|[0-9]+)$/);
const expectedPidSchema = z.number().int().min(1).optional();

function requireWindows() {
  if (process.platform !== "win32") throw new Error("Window Control tools are available only on Windows.");
}

function psLiteral(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function nativePrelude() {
  return String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class LConnectWindowNative {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int maxCount);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int x, int y, int width, int height, bool repaint);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

  public static IntPtr[] EnumerateWindows() {
    var list = new System.Collections.Generic.List<IntPtr>();
    EnumWindows((h, l) => { list.Add(h); return true; }, IntPtr.Zero);
    return list.ToArray();
  }
}
'@

function Convert-ToHwnd([string]$value) {
  if ($value.StartsWith('0x', [StringComparison]::OrdinalIgnoreCase)) {
    $raw = [Convert]::ToUInt64($value.Substring(2), 16)
  } else {
    $raw = [Convert]::ToUInt64($value, 10)
  }
  return [IntPtr]::new([long]$raw)
}

function Convert-ToBase64([string]$value) {
  if ($null -eq $value) { return $null }
  return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($value))
}

function Get-LConnectWindowInfo([IntPtr]$h) {
  if (-not [LConnectWindowNative]::IsWindow($h)) { return $null }
  [uint32]$processId = 0
  [void][LConnectWindowNative]::GetWindowThreadProcessId($h, [ref]$processId)

  $titleLen = [Math]::Max(0, [LConnectWindowNative]::GetWindowTextLength($h))
  $titleBuilder = New-Object Text.StringBuilder ([Math]::Max(2, $titleLen + 2))
  [void][LConnectWindowNative]::GetWindowText($h, $titleBuilder, $titleBuilder.Capacity)

  $classBuilder = New-Object Text.StringBuilder 512
  [void][LConnectWindowNative]::GetClassName($h, $classBuilder, $classBuilder.Capacity)

  $rect = New-Object LConnectWindowNative+RECT
  $rectOk = [LConnectWindowNative]::GetWindowRect($h, [ref]$rect)

  $processName = $null
  try { $processName = [string](Get-Process -Id $processId -ErrorAction Stop).ProcessName } catch {}

  $hwndHex = '0x{0:X}' -f $h.ToInt64()
  $owner = $null
  [pscustomobject]@{
    hwnd = $hwndHex
    pid = [int]$processId
    process_name_base64 = Convert-ToBase64 $processName
    title_base64 = Convert-ToBase64 $titleBuilder.ToString()
    class_name_base64 = Convert-ToBase64 $classBuilder.ToString()
    visible = [bool][LConnectWindowNative]::IsWindowVisible($h)
    minimized = [bool][LConnectWindowNative]::IsIconic($h)
    maximized = [bool][LConnectWindowNative]::IsZoomed($h)
    foreground = ([LConnectWindowNative]::GetForegroundWindow() -eq $h)
    rect_available = [bool]$rectOk
    x = if ($rectOk) { [int]$rect.Left } else { $null }
    y = if ($rectOk) { [int]$rect.Top } else { $null }
    width = if ($rectOk) { [int]($rect.Right - $rect.Left) } else { $null }
    height = if ($rectOk) { [int]($rect.Bottom - $rect.Top) } else { $null }
    right = if ($rectOk) { [int]$rect.Right } else { $null }
    bottom = if ($rectOk) { [int]$rect.Bottom } else { $null }
  }
}

function Assert-LConnectWindowIdentity([IntPtr]$h, $expectedPid) {
  $info = Get-LConnectWindowInfo $h
  if ($null -eq $info) { throw 'WINDOW_NOT_FOUND' }
  if ($null -ne $expectedPid) {
    $expected = [int]$expectedPid
    if ($info.pid -ne $expected) {
      throw ('WINDOW_IDENTITY_MISMATCH expected_pid={0} actual_pid={1}' -f $expected, $info.pid)
    }
  }
  return $info
}
`;
}

function decodeBase64(value) {
  if (typeof value !== "string") return null;
  return Buffer.from(value, "base64").toString("utf8");
}

function normalizeWindow(raw) {
  if (!raw) return null;
  const out = { ...raw };
  out.process_name = decodeBase64(raw.process_name_base64);
  out.title = decodeBase64(raw.title_base64) ?? "";
  out.class_name = decodeBase64(raw.class_name_base64) ?? "";
  delete out.process_name_base64;
  delete out.title_base64;
  delete out.class_name_base64;
  return out;
}

async function runWindowJson(body, config, timeoutSeconds = 10) {
  requireWindows();
  const result = await runProcess(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", nativePrelude() + "\n" + body],
    {
      timeoutSeconds: Math.min(timeoutSeconds, config.shell.maxTimeoutSeconds),
      maxOutputChars: Math.max(8192, Math.min(config.shell.maxOutputChars, 1500000)),
    }
  );

  if (result.error) throw new Error(`Failed to launch PowerShell window worker: ${result.error}`);
  if (result.timedOut) throw new Error("Window operation timed out.");
  if (result.code) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`Window operation failed (exit ${result.code})${detail ? `: ${detail}` : ""}`);
  }

  const raw = (result.stdout || "").trim();
  if (!raw) throw new Error("Window worker returned no result.");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse window worker output as JSON: ${error.message}`);
  }
}

async function getWindow(hwnd, config) {
  const body = [
    `$h = Convert-ToHwnd ${psLiteral(hwnd)}`,
    "$item = Get-LConnectWindowInfo $h",
    "if ($null -eq $item) { [pscustomobject]@{ found = $false; hwnd = " + psLiteral(hwnd) + " } | ConvertTo-Json -Compress; exit 0 }",
    "[pscustomobject]@{ found = $true; window = $item } | ConvertTo-Json -Compress -Depth 5",
  ].join("\n");
  const raw = await runWindowJson(body, config);
  return raw?.found ? { found: true, window: normalizeWindow(raw.window) } : raw;
}

async function listWindows(args, config) {
  const limit = args.limit ?? 200;
  const rawLimit = limit + 1;
  const filters = [];

  if (args.visible_only) filters.push("if (-not $item.visible) { continue }");
  if (!args.include_untitled) filters.push("if ([string]::IsNullOrEmpty([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($item.title_base64)))) { continue }");
  if (args.pid) filters.push(`if ($item.pid -ne ${args.pid}) { continue }`);
  if (args.process_name) {
    filters.push(`$pn = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($item.process_name_base64)); if (-not ($pn -ieq ${psLiteral(args.process_name)})) { continue }`);
  }
  if (args.title_contains) {
    filters.push(`$tt = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($item.title_base64)); if ($tt.IndexOf(${psLiteral(args.title_contains)}, [StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }`);
  }

  const body = [
    "$items = New-Object System.Collections.Generic.List[object]",
    "foreach ($h in [LConnectWindowNative]::EnumerateWindows()) {",
    "  $item = Get-LConnectWindowInfo $h",
    "  if ($null -eq $item) { continue }",
    ...filters.map((x) => "  " + x),
    "  $items.Add($item)",
    `  if ($items.Count -ge ${rawLimit}) { break }`,
    "}",
    `[pscustomobject]@{ count = [Math]::Min($items.Count, ${limit}); truncated = ($items.Count -gt ${limit}); windows = @($items | Select-Object -First ${limit}) } | ConvertTo-Json -Compress -Depth 5`,
  ].join("\n");

  const raw = await runWindowJson(body, config, 15);
  return {
    count: Number(raw.count ?? 0),
    truncated: Boolean(raw.truncated),
    windows: (Array.isArray(raw.windows) ? raw.windows : raw.windows ? [raw.windows] : []).map(normalizeWindow),
  };
}

async function mutateWindow(hwnd, expectedPid, action, config, extra = {}) {
  const expected = expectedPid == null ? "$null" : `[Nullable[int]]${expectedPid}`;
  const lines = [
    `$h = Convert-ToHwnd ${psLiteral(hwnd)}`,
    `$expectedPid = ${expected}`,
    "$before = Assert-LConnectWindowIdentity $h $expectedPid",
  ];

  if (action === "focus") {
    lines.push(
      "if ($before.minimized) { [void][LConnectWindowNative]::ShowWindowAsync($h, 9) }",
      "$apiResult = [bool][LConnectWindowNative]::SetForegroundWindow($h)",
      "Start-Sleep -Milliseconds 120",
      "$after = Get-LConnectWindowInfo $h",
      "$ok = ($null -ne $after -and $after.foreground)",
      "[pscustomobject]@{ ok = $ok; action = 'focus'; api_result = $apiResult; before = $before; after = $after; note = if ($ok) { $null } else { 'Windows foreground policy may reject focus stealing.' } } | ConvertTo-Json -Compress -Depth 6"
    );
  } else if (action === "move" || action === "resize") {
    const x = action === "move" ? extra.x : "$before.x";
    const y = action === "move" ? extra.y : "$before.y";
    const width = action === "resize" ? extra.width : "$before.width";
    const height = action === "resize" ? extra.height : "$before.height";
    lines.push(
      `$ok = [bool][LConnectWindowNative]::MoveWindow($h, ${x}, ${y}, ${width}, ${height}, $true)`,
      "Start-Sleep -Milliseconds 80",
      "$after = Get-LConnectWindowInfo $h",
      `[pscustomobject]@{ ok = $ok; action = '${action}'; before = $before; after = $after } | ConvertTo-Json -Compress -Depth 6`
    );
  } else if (action === "minimize") {
    lines.push(
      "$apiResult = [bool][LConnectWindowNative]::ShowWindowAsync($h, 6)",
      "Start-Sleep -Milliseconds 100",
      "$after = Get-LConnectWindowInfo $h",
      "$ok = ($null -ne $after -and $after.minimized)",
      "[pscustomobject]@{ ok = $ok; action = 'minimize'; api_result = $apiResult; before = $before; after = $after } | ConvertTo-Json -Compress -Depth 6"
    );
  } else if (action === "maximize") {
    lines.push(
      "$apiResult = [bool][LConnectWindowNative]::ShowWindowAsync($h, 3)",
      "Start-Sleep -Milliseconds 100",
      "$after = Get-LConnectWindowInfo $h",
      "$ok = ($null -ne $after -and $after.maximized)",
      "[pscustomobject]@{ ok = $ok; action = 'maximize'; api_result = $apiResult; before = $before; after = $after } | ConvertTo-Json -Compress -Depth 6"
    );
  } else if (action === "close") {
    lines.push(
      "$posted = [bool][LConnectWindowNative]::PostMessage($h, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)",
      `$deadline = [DateTime]::UtcNow.AddMilliseconds(${extra.waitMs ?? 1500})`,
      "while ([DateTime]::UtcNow -lt $deadline -and [LConnectWindowNative]::IsWindow($h)) { Start-Sleep -Milliseconds 50 }",
      "$closed = -not [LConnectWindowNative]::IsWindow($h)",
      "$after = if ($closed) { $null } else { Get-LConnectWindowInfo $h }",
      "[pscustomobject]@{ ok = ($posted -and $closed); action = 'close'; posted = $posted; closed = $closed; before = $before; after = $after } | ConvertTo-Json -Compress -Depth 6"
    );
  } else {
    throw new Error(`Unsupported window action: ${action}`);
  }

  const raw = await runWindowJson(lines.join("\n"), config, action === "close" ? 8 : 10);
  return {
    ...raw,
    before: normalizeWindow(raw.before),
    after: normalizeWindow(raw.after),
  };
}

function mutationSchema(extra = {}) {
  return { hwnd: hwndSchema, expected_pid: expectedPidSchema, ...extra };
}

export function registerWindowControlTools(server, config) {
  server.tool("list_windows", "List native top-level Windows windows with HWND/PID/title/class/rectangle evidence.", {
    visible_only: z.boolean().optional(),
    include_untitled: z.boolean().optional(),
    pid: z.number().int().min(1).optional(),
    process_name: z.string().min(1).max(260).optional(),
    title_contains: z.string().min(1).max(1000).optional(),
    limit: z.number().int().min(1).max(500).optional(),
  }, async (args) => {
    try {
      return textResult(await listWindows({
        visible_only: args.visible_only ?? true,
        include_untitled: args.include_untitled ?? false,
        ...args,
      }, config));
    } catch (error) {
      return textResult(error.message, true);
    }
  });

  server.tool("get_window", "Inspect one native window by exact HWND.", { hwnd: hwndSchema }, async ({ hwnd }) => {
    try { return textResult(await getWindow(hwnd, config)); }
    catch (error) { return textResult(error.message, true); }
  });

  server.tool("focus_window", "Request foreground focus for a native window. Windows may reject focus stealing; actual foreground state is reported.", mutationSchema(), async ({ hwnd, expected_pid }) => {
    try { return textResult(await mutateWindow(hwnd, expected_pid, "focus", config)); }
    catch (error) { return textResult(error.message, true); }
  });

  server.tool("move_window", "Move a native window using virtual-desktop screen coordinates; negative coordinates are valid on multi-monitor layouts.", mutationSchema({
    x: z.number().int().min(-100000).max(100000),
    y: z.number().int().min(-100000).max(100000),
  }), async ({ hwnd, expected_pid, x, y }) => {
    try { return textResult(await mutateWindow(hwnd, expected_pid, "move", config, { x, y })); }
    catch (error) { return textResult(error.message, true); }
  });

  server.tool("resize_window", "Resize a native window while preserving its current top-left position.", mutationSchema({
    width: z.number().int().min(1).max(100000),
    height: z.number().int().min(1).max(100000),
  }), async ({ hwnd, expected_pid, width, height }) => {
    try { return textResult(await mutateWindow(hwnd, expected_pid, "resize", config, { width, height })); }
    catch (error) { return textResult(error.message, true); }
  });

  server.tool("minimize_window", "Minimize a native window and return before/after evidence.", mutationSchema(), async ({ hwnd, expected_pid }) => {
    try { return textResult(await mutateWindow(hwnd, expected_pid, "minimize", config)); }
    catch (error) { return textResult(error.message, true); }
  });

  server.tool("maximize_window", "Maximize a native window and return before/after evidence.", mutationSchema(), async ({ hwnd, expected_pid }) => {
    try { return textResult(await mutateWindow(hwnd, expected_pid, "maximize", config)); }
    catch (error) { return textResult(error.message, true); }
  });

  server.tool("close_window", "Request a native window to close by posting WM_CLOSE; this does not forcibly terminate the owning process.", mutationSchema({
    wait_ms: z.number().int().min(0).max(5000).optional(),
  }), async ({ hwnd, expected_pid, wait_ms }) => {
    try { return textResult(await mutateWindow(hwnd, expected_pid, "close", config, { waitMs: wait_ms ?? 1500 })); }
    catch (error) { return textResult(error.message, true); }
  });
}
