import { z } from "zod";
import { runProcess } from "./runtime.mjs";

function textResult(value, isError = false) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

const hwndSchema = z.string().regex(/^(?:0x[0-9a-fA-F]+|[0-9]+)$/);
const expectedPidSchema = z.number().int().min(1).optional();

const KEY_CODES = new Map([
  ["BACKSPACE", 0x08], ["TAB", 0x09], ["ENTER", 0x0D], ["RETURN", 0x0D],
  ["SHIFT", 0x10], ["CTRL", 0x11], ["CONTROL", 0x11], ["ALT", 0x12],
  ["PAUSE", 0x13], ["CAPSLOCK", 0x14], ["ESC", 0x1B], ["ESCAPE", 0x1B],
  ["SPACE", 0x20], ["PAGEUP", 0x21], ["PAGEDOWN", 0x22], ["END", 0x23],
  ["HOME", 0x24], ["LEFT", 0x25], ["UP", 0x26], ["RIGHT", 0x27], ["DOWN", 0x28],
  ["PRINTSCREEN", 0x2C], ["INSERT", 0x2D], ["DELETE", 0x2E],
  ["LWIN", 0x5B], ["RWIN", 0x5C], ["APPS", 0x5D],
  ["NUMLOCK", 0x90], ["SCROLLLOCK", 0x91],
  ["LSHIFT", 0xA0], ["RSHIFT", 0xA1], ["LCTRL", 0xA2], ["RCTRL", 0xA3],
  ["LALT", 0xA4], ["RALT", 0xA5],
]);

for (let i = 0; i <= 9; i += 1) KEY_CODES.set(String(i), 0x30 + i);
for (let i = 0; i < 26; i += 1) KEY_CODES.set(String.fromCharCode(65 + i), 0x41 + i);
for (let i = 1; i <= 24; i += 1) KEY_CODES.set(`F${i}`, 0x6F + i);

function requireWindows() {
  if (process.platform !== "win32") throw new Error("Keyboard / Mouse tools are available only on Windows.");
}

function psLiteral(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function parseKey(key) {
  const normalized = String(key).trim().toUpperCase();
  const vk = KEY_CODES.get(normalized);
  if (vk == null) {
    throw new Error(`Unsupported key: ${key}. Use A-Z, 0-9, F1-F24, arrows, Enter, Tab, Esc, Space, Backspace, Delete, Insert, Home/End/PageUp/PageDown, Shift/Ctrl/Alt/Win variants.`);
  }
  return { name: normalized, vk };
}

function nativePrelude() {
  return String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class LConnectInputNative {
  public const uint INPUT_MOUSE = 0;
  public const uint INPUT_KEYBOARD = 1;

  public const uint KEYEVENTF_KEYUP = 0x0002;
  public const uint KEYEVENTF_UNICODE = 0x0004;

  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;
  public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
  public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
  public const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
  public const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
  public const uint MOUSEEVENTF_WHEEL = 0x0800;
  public const uint MOUSEEVENTF_HWHEEL = 0x01000;
  public const uint GA_ROOT = 2;

  [StructLayout(LayoutKind.Sequential)]
  public struct POINT {
    public int X;
    public int Y;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT {
    public uint type;
    public InputUnion U;
  }

  [StructLayout(LayoutKind.Explicit)]
  public struct InputUnion {
    [FieldOffset(0)] public MOUSEINPUT mi;
    [FieldOffset(0)] public KEYBDINPUT ki;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT {
    public int dx;
    public int dy;
    public uint mouseData;
    public uint dwFlags;
    public uint time;
    public UIntPtr dwExtraInfo;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT {
    public ushort wVk;
    public ushort wScan;
    public uint dwFlags;
    public uint time;
    public UIntPtr dwExtraInfo;
  }

  [DllImport("user32.dll", SetLastError=true)]
  public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT point);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);

  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();

  public static uint SendKey(ushort vk, bool keyUp) {
    var input = new INPUT();
    input.type = INPUT_KEYBOARD;
    input.U.ki.wVk = vk;
    input.U.ki.wScan = 0;
    input.U.ki.dwFlags = keyUp ? KEYEVENTF_KEYUP : 0;
    return SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT)));
  }

  public static uint SendUnicodeChar(char ch, bool keyUp) {
    var input = new INPUT();
    input.type = INPUT_KEYBOARD;
    input.U.ki.wVk = 0;
    input.U.ki.wScan = ch;
    input.U.ki.dwFlags = KEYEVENTF_UNICODE | (keyUp ? KEYEVENTF_KEYUP : 0);
    return SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT)));
  }

  public static uint SendMouse(uint flags, uint data) {
    var input = new INPUT();
    input.type = INPUT_MOUSE;
    input.U.mi.dwFlags = flags;
    input.U.mi.mouseData = data;
    return SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT)));
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

function Convert-HwndString([IntPtr]$h) {
  if ($h -eq [IntPtr]::Zero) { return $null }
  return ('0x{0:X}' -f $h.ToInt64())
}

function Get-CursorEvidence {
  $p = New-Object LConnectInputNative+POINT
  $ok = [LConnectInputNative]::GetCursorPos([ref]$p)
  [pscustomobject]@{ available = [bool]$ok; x = if ($ok) { [int]$p.X } else { $null }; y = if ($ok) { [int]$p.Y } else { $null } }
}

function Get-RootWindowAtPoint([int]$x, [int]$y) {
  $p = New-Object LConnectInputNative+POINT
  $p.X = $x
  $p.Y = $y
  $h = [LConnectInputNative]::WindowFromPoint($p)
  if ($h -eq [IntPtr]::Zero) { return [IntPtr]::Zero }
  $root = [LConnectInputNative]::GetAncestor($h, [LConnectInputNative]::GA_ROOT)
  if ($root -eq [IntPtr]::Zero) { return $h }
  return $root
}

function Assert-WindowIdentity([IntPtr]$h, $expectedPid) {
  if (-not [LConnectInputNative]::IsWindow($h)) { throw 'WINDOW_NOT_FOUND' }
  [uint32]$processId = 0
  [void][LConnectInputNative]::GetWindowThreadProcessId($h, [ref]$processId)
  if ($null -ne $expectedPid) {
    $expected = [int]$expectedPid
    if ([int]$processId -ne $expected) {
      throw ('WINDOW_IDENTITY_MISMATCH expected_pid={0} actual_pid={1}' -f $expected, [int]$processId)
    }
  }
  [pscustomobject]@{ hwnd = Convert-HwndString $h; pid = [int]$processId }
}

function Assert-ForegroundTarget([IntPtr]$h, $expectedPid) {
  $identity = Assert-WindowIdentity $h $expectedPid
  if ([LConnectInputNative]::IsIconic($h)) { [void][LConnectInputNative]::ShowWindowAsync($h, 9) }

  $foreground = [LConnectInputNative]::GetForegroundWindow()
  if ($foreground -ne $h) {
    [uint32]$ignoredProcess = 0
    $targetThread = [LConnectInputNative]::GetWindowThreadProcessId($h, [ref]$ignoredProcess)
    $currentThread = [LConnectInputNative]::GetCurrentThreadId()
    $foregroundThread = if ($foreground -eq [IntPtr]::Zero) { 0 } else { [LConnectInputNative]::GetWindowThreadProcessId($foreground, [ref]$ignoredProcess) }

    $attachedForeground = $false
    $attachedTarget = $false
    try {
      if ($foregroundThread -ne 0 -and $foregroundThread -ne $currentThread) {
        $attachedForeground = [LConnectInputNative]::AttachThreadInput($currentThread, $foregroundThread, $true)
      }
      if ($targetThread -ne 0 -and $targetThread -ne $currentThread) {
        $attachedTarget = [LConnectInputNative]::AttachThreadInput($currentThread, $targetThread, $true)
      }
      [void][LConnectInputNative]::BringWindowToTop($h)
      [void][LConnectInputNative]::SetForegroundWindow($h)
      [void][LConnectInputNative]::SetFocus($h)
    } finally {
      if ($attachedTarget) { [void][LConnectInputNative]::AttachThreadInput($currentThread, $targetThread, $false) }
      if ($attachedForeground) { [void][LConnectInputNative]::AttachThreadInput($currentThread, $foregroundThread, $false) }
    }
    Start-Sleep -Milliseconds 120
  }

  $foreground = [LConnectInputNative]::GetForegroundWindow()
  if ($foreground -ne $h) {
    throw ('FOREGROUND_NOT_ACQUIRED target={0} actual={1}' -f (Convert-HwndString $h), (Convert-HwndString $foreground))
  }
  return $identity
}

function Assert-PointTarget([int]$x, [int]$y, $expectedHwnd) {
  $actual = Get-RootWindowAtPoint $x $y
  if ($null -ne $expectedHwnd) {
    $expected = Convert-ToHwnd $expectedHwnd
    if ($actual -ne $expected) {
      throw ('POINT_WINDOW_MISMATCH expected_hwnd={0} actual_hwnd={1} x={2} y={3}' -f (Convert-HwndString $expected), (Convert-HwndString $actual), $x, $y)
    }
  }
  return (Convert-HwndString $actual)
}
`;
}

async function runInputJson(body, config, timeoutSeconds = 10) {
  requireWindows();
  const result = await runProcess(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", nativePrelude() + "\n" + body],
    {
      timeoutSeconds: Math.min(timeoutSeconds, config.shell.maxTimeoutSeconds),
      maxOutputChars: Math.max(8192, Math.min(config.shell.maxOutputChars, 1000000)),
    }
  );

  if (result.error) throw new Error(`Failed to launch PowerShell input worker: ${result.error}`);
  if (result.timedOut) throw new Error("Input operation timed out.");
  if (result.code) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`Input operation failed (exit ${result.code})${detail ? `: ${detail}` : ""}`);
  }
  const raw = (result.stdout || "").trim();
  if (!raw) throw new Error("Input worker returned no result.");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse input worker output as JSON: ${error.message}`);
  }
}

function targetPrelude(hwnd, expectedPid) {
  const expected = expectedPid == null ? "$null" : String(expectedPid);
  return [
    `$h = Convert-ToHwnd ${psLiteral(hwnd)}`,
    `$expectedPid = ${expected}`,
    "$target = Assert-ForegroundTarget $h $expectedPid",
  ];
}

async function keyPress(hwnd, expectedPid, key, config) {
  const parsed = parseKey(key);
  const lines = [
    ...targetPrelude(hwnd, expectedPid),
    `$down = [LConnectInputNative]::SendKey([uint16]${parsed.vk}, $false)`,
    `$up = [LConnectInputNative]::SendKey([uint16]${parsed.vk}, $true)`,
    "if ($down -ne 1 -or $up -ne 1) { throw ('SEND_INPUT_FAILED down={0} up={1}' -f $down, $up) }",
    `[pscustomobject]@{ ok = $true; action = 'key_press'; key = ${psLiteral(parsed.name)}; vk = ${parsed.vk}; sent_inputs = [int]($down + $up); target = $target } | ConvertTo-Json -Compress -Depth 4`,
  ];
  return runInputJson(lines.join("\n"), config);
}

async function keyCombo(hwnd, expectedPid, keys, config) {
  const parsed = keys.map(parseKey);
  const lines = [...targetPrelude(hwnd, expectedPid), "$sent = 0"];
  for (const item of parsed) {
    lines.push(`$n = [LConnectInputNative]::SendKey([uint16]${item.vk}, $false); if ($n -ne 1) { throw 'SEND_INPUT_FAILED key_down' }; $sent += $n`);
  }
  for (const item of [...parsed].reverse()) {
    lines.push(`$n = [LConnectInputNative]::SendKey([uint16]${item.vk}, $true); if ($n -ne 1) { throw 'SEND_INPUT_FAILED key_up' }; $sent += $n`);
  }
  const names = JSON.stringify(parsed.map((x) => x.name)).replace(/'/g, "''");
  lines.push(
    `[pscustomobject]@{ ok = $true; action = 'key_combo'; keys_json = '${names}'; sent_inputs = [int]$sent; target = $target } | ConvertTo-Json -Compress -Depth 4`
  );
  const raw = await runInputJson(lines.join("\n"), config);
  return { ...raw, keys: JSON.parse(raw.keys_json), keys_json: undefined };
}

async function typeText(hwnd, expectedPid, text, intervalMs, config) {
  const encoded = Buffer.from(text, "utf8").toString("base64");
  const lines = [
    ...targetPrelude(hwnd, expectedPid),
    `$bytes = [Convert]::FromBase64String(${psLiteral(encoded)})`,
    "$value = [Text.Encoding]::UTF8.GetString($bytes)",
    "$sent = 0",
    "foreach ($ch in $value.ToCharArray()) {",
    "  $n1 = [LConnectInputNative]::SendUnicodeChar($ch, $false)",
    "  $n2 = [LConnectInputNative]::SendUnicodeChar($ch, $true)",
    "  if ($n1 -ne 1 -or $n2 -ne 1) { throw ('SEND_INPUT_FAILED unicode={0}' -f [int]$ch) }",
    "  $sent += ($n1 + $n2)",
    intervalMs > 0 ? `  Start-Sleep -Milliseconds ${intervalMs}` : "",
    "}",
    "[pscustomobject]@{ ok = $true; action = 'type_text'; chars = $value.Length; sent_inputs = [int]$sent; target = $target } | ConvertTo-Json -Compress -Depth 4",
  ].filter(Boolean);
  return runInputJson(lines.join("\n"), config, Math.min(30, 10 + Math.ceil((text.length * intervalMs) / 1000)));
}

async function mouseMove(x, y, config) {
  const lines = [
    "$before = Get-CursorEvidence",
    `$ok = [bool][LConnectInputNative]::SetCursorPos(${x}, ${y})`,
    "Start-Sleep -Milliseconds 20",
    "$after = Get-CursorEvidence",
    `$window = Get-RootWindowAtPoint ${x} ${y}`,
    "[pscustomobject]@{ ok = $ok; action = 'mouse_move'; before = $before; after = $after; window_at_point = Convert-HwndString $window } | ConvertTo-Json -Compress -Depth 4",
  ];
  return runInputJson(lines.join("\n"), config);
}

function mouseFlags(button) {
  if (button === "left") return { down: "MOUSEEVENTF_LEFTDOWN", up: "MOUSEEVENTF_LEFTUP" };
  if (button === "right") return { down: "MOUSEEVENTF_RIGHTDOWN", up: "MOUSEEVENTF_RIGHTUP" };
  return { down: "MOUSEEVENTF_MIDDLEDOWN", up: "MOUSEEVENTF_MIDDLEUP" };
}

async function mouseClick(x, y, button, clicks, expectedHwnd, config) {
  const flags = mouseFlags(button);
  const expected = expectedHwnd == null ? "$null" : psLiteral(expectedHwnd);
  const lines = [
    "$before = Get-CursorEvidence",
    `$expectedHwnd = ${expected}`,
    `$pointWindow = Assert-PointTarget ${x} ${y} $expectedHwnd`,
    `if (-not [LConnectInputNative]::SetCursorPos(${x}, ${y})) { throw 'SET_CURSOR_FAILED' }`,
    "$sent = 0",
    `for ($i = 0; $i -lt ${clicks}; $i++) {`,
    `  $n1 = [LConnectInputNative]::SendMouse([LConnectInputNative]::${flags.down}, 0)`,
    `  $n2 = [LConnectInputNative]::SendMouse([LConnectInputNative]::${flags.up}, 0)`,
    "  if ($n1 -ne 1 -or $n2 -ne 1) { throw 'SEND_INPUT_FAILED mouse_click' }",
    "  $sent += ($n1 + $n2)",
    clicks > 1 ? "  Start-Sleep -Milliseconds 80" : "",
    "}",
    "$after = Get-CursorEvidence",
    `[pscustomobject]@{ ok = $true; action = 'mouse_click'; button = ${psLiteral(button)}; clicks = ${clicks}; x = ${x}; y = ${y}; sent_inputs = [int]$sent; point_window = $pointWindow; before = $before; after = $after } | ConvertTo-Json -Compress -Depth 4`,
  ].filter(Boolean);
  return runInputJson(lines.join("\n"), config);
}

async function mouseScroll(x, y, delta, horizontal, expectedHwnd, config) {
  const expected = expectedHwnd == null ? "$null" : psLiteral(expectedHwnd);
  const flag = horizontal ? "MOUSEEVENTF_HWHEEL" : "MOUSEEVENTF_WHEEL";
  const data = delta >>> 0;
  const lines = [
    "$before = Get-CursorEvidence",
    `$expectedHwnd = ${expected}`,
    `$pointWindow = Assert-PointTarget ${x} ${y} $expectedHwnd`,
    `if (-not [LConnectInputNative]::SetCursorPos(${x}, ${y})) { throw 'SET_CURSOR_FAILED' }`,
    `$sent = [LConnectInputNative]::SendMouse([LConnectInputNative]::${flag}, [uint32]${data})`,
    "if ($sent -ne 1) { throw 'SEND_INPUT_FAILED mouse_scroll' }",
    "$after = Get-CursorEvidence",
    `[pscustomobject]@{ ok = $true; action = 'mouse_scroll'; delta = ${delta}; horizontal = ${horizontal ? "$true" : "$false"}; x = ${x}; y = ${y}; sent_inputs = [int]$sent; point_window = $pointWindow; before = $before; after = $after } | ConvertTo-Json -Compress -Depth 4`,
  ];
  return runInputJson(lines.join("\n"), config);
}

export function registerInputControlTools(server, config) {
  server.tool("key_press", "Press and release one supported virtual key on a guarded foreground HWND target.", {
    hwnd: hwndSchema,
    expected_pid: expectedPidSchema,
    key: z.string().min(1).max(32),
  }, async ({ hwnd, expected_pid, key }) => {
    try { return textResult(await keyPress(hwnd, expected_pid, key, config)); }
    catch (error) { return textResult(error.message, true); }
  });

  server.tool("key_combo", "Press a guarded key combination on a foreground HWND target, releasing keys in reverse order.", {
    hwnd: hwndSchema,
    expected_pid: expectedPidSchema,
    keys: z.array(z.string().min(1).max(32)).min(2).max(8),
  }, async ({ hwnd, expected_pid, keys }) => {
    try { return textResult(await keyCombo(hwnd, expected_pid, keys, config)); }
    catch (error) { return textResult(error.message, true); }
  });

  server.tool("type_text", "Type Unicode text into a guarded foreground HWND target using KEYEVENTF_UNICODE.", {
    hwnd: hwndSchema,
    expected_pid: expectedPidSchema,
    text: z.string().max(20000),
    interval_ms: z.number().int().min(0).max(1000).optional(),
  }, async ({ hwnd, expected_pid, text, interval_ms = 0 }) => {
    try { return textResult(await typeText(hwnd, expected_pid, text, interval_ms, config)); }
    catch (error) { return textResult(error.message, true); }
  });

  server.tool("mouse_move", "Move the Windows cursor to virtual-desktop screen coordinates and report cursor/window evidence.", {
    x: z.number().int().min(-100000).max(100000),
    y: z.number().int().min(-100000).max(100000),
  }, async ({ x, y }) => {
    try { return textResult(await mouseMove(x, y, config)); }
    catch (error) { return textResult(error.message, true); }
  });

  server.tool("mouse_click", "Click at virtual-desktop screen coordinates with optional exact root-HWND point guard.", {
    x: z.number().int().min(-100000).max(100000),
    y: z.number().int().min(-100000).max(100000),
    button: z.enum(["left", "right", "middle"]).optional(),
    clicks: z.number().int().min(1).max(3).optional(),
    expected_hwnd: hwndSchema.optional(),
  }, async ({ x, y, button = "left", clicks = 1, expected_hwnd }) => {
    try { return textResult(await mouseClick(x, y, button, clicks, expected_hwnd, config)); }
    catch (error) { return textResult(error.message, true); }
  });

  server.tool("mouse_scroll", "Send vertical or horizontal wheel input at screen coordinates with optional exact root-HWND point guard.", {
    x: z.number().int().min(-100000).max(100000),
    y: z.number().int().min(-100000).max(100000),
    delta: z.number().int().min(-12000).max(12000).refine((v) => v !== 0, "delta must not be zero"),
    horizontal: z.boolean().optional(),
    expected_hwnd: hwndSchema.optional(),
  }, async ({ x, y, delta, horizontal = false, expected_hwnd }) => {
    try { return textResult(await mouseScroll(x, y, delta, horizontal, expected_hwnd, config)); }
    catch (error) { return textResult(error.message, true); }
  });
}
