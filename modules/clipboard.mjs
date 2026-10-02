import { z } from "zod";
import { runProcess } from "./runtime.mjs";

function textResult(value, isError = false) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

const DEFAULT_MAX_CHARS = 120000;
const HARD_MAX_CHARS = 200000;
const MAX_SET_CHARS = 1000000;

function requireWindows() {
  if (process.platform !== "win32") {
    throw new Error("Clipboard tools are available only on Windows.");
  }
}

function psLiteral(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function clipboardPrelude() {
  return [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$ErrorActionPreference = 'Stop'",
    "$attempts = 0",
  ].join("\n");
}

function withClipboardRetry(body) {
  return [
    clipboardPrelude(),
    "while ($true) {",
    "  try {",
    ...body.map((line) => "    " + line),
    "    break",
    "  } catch [System.Runtime.InteropServices.ExternalException] {",
    "    $attempts++",
    "    if ($attempts -ge 5) { throw }",
    "    Start-Sleep -Milliseconds 80",
    "  }",
    "}",
  ].join("\n");
}

async function runClipboardJson(script, config) {
  requireWindows();

  const result = await runProcess(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Sta",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ],
    {
      timeoutSeconds: Math.min(10, config.shell.maxTimeoutSeconds),
      maxOutputChars: Math.max(4096, Math.min(config.shell.maxOutputChars, 1500000)),
    }
  );

  if (result.error) {
    throw new Error(`Failed to launch PowerShell clipboard worker: ${result.error}`);
  }
  if (result.timedOut) {
    throw new Error("Clipboard operation timed out.");
  }
  if (result.code) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(
      `Clipboard operation failed (exit ${result.code})${detail ? `: ${detail}` : ""}`
    );
  }

  const raw = (result.stdout || "").trim();
  if (!raw) throw new Error("Clipboard worker returned no result.");

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse clipboard worker output as JSON: ${error.message}`);
  }
}

async function getClipboard(maxChars, config) {
  const script = withClipboardRetry([
    "$data = [System.Windows.Forms.Clipboard]::GetDataObject()",
    "$formats = @()",
    "if ($null -ne $data) { $formats = @($data.GetFormats($false)) }",
    "$hasText = [System.Windows.Forms.Clipboard]::ContainsText([System.Windows.Forms.TextDataFormat]::UnicodeText)",
    "if ($hasText) {",
    "  $text = [System.Windows.Forms.Clipboard]::GetText([System.Windows.Forms.TextDataFormat]::UnicodeText)",
    "  $textBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($text))",
    "  $out = [pscustomobject]@{ state = 'text'; text_base64 = $textBase64; format_count = $formats.Count }",
    "} elseif ($formats.Count -eq 0) {",
    "  $out = [pscustomobject]@{ state = 'empty'; text_base64 = $null; format_count = 0 }",
    "} else {",
    "  $out = [pscustomobject]@{ state = 'non_text'; text_base64 = $null; format_count = $formats.Count }",
    "}",
    "$out | ConvertTo-Json -Compress",
  ]);

  const raw = await runClipboardJson(script, config);
  const text = typeof raw.text_base64 === "string"
    ? Buffer.from(raw.text_base64, "base64").toString("utf8")
    : null;
  const originalChars = text?.length ?? 0;
  const truncated = text !== null && originalChars > maxChars;

  return {
    state: raw.state,
    text: text === null ? null : text.slice(0, maxChars),
    chars: text === null ? null : Math.min(originalChars, maxChars),
    original_chars: text === null ? null : originalChars,
    truncated,
    format_count: Number(raw.format_count ?? 0),
  };
}

async function setClipboard(value, config) {
  const encoded = Buffer.from(value, "utf8").toString("base64");
  const script = withClipboardRetry([
    `$bytes = [Convert]::FromBase64String(${psLiteral(encoded)})`,
    "$value = [Text.Encoding]::UTF8.GetString($bytes)",
    "[System.Windows.Forms.Clipboard]::SetText($value, [System.Windows.Forms.TextDataFormat]::UnicodeText)",
    "$readback = [System.Windows.Forms.Clipboard]::GetText([System.Windows.Forms.TextDataFormat]::UnicodeText)",
    "[pscustomobject]@{ ok = $true; chars = $readback.Length; exact = ($readback -ceq $value) } | ConvertTo-Json -Compress",
  ]);
  return runClipboardJson(script, config);
}

async function clearClipboard(config) {
  const script = withClipboardRetry([
    "[System.Windows.Forms.Clipboard]::Clear()",
    "$data = [System.Windows.Forms.Clipboard]::GetDataObject()",
    "$formats = @()",
    "if ($null -ne $data) { $formats = @($data.GetFormats($false)) }",
    "[pscustomobject]@{ ok = ($formats.Count -eq 0); state = if ($formats.Count -eq 0) { 'empty' } else { 'non_text' }; format_count = $formats.Count } | ConvertTo-Json -Compress",
  ]);
  return runClipboardJson(script, config);
}

export function registerClipboardTools(server, config) {
  server.tool(
    "clipboard_get",
    "Read text from the Windows clipboard with bounded output and explicit empty/non-text state.",
    {
      max_chars: z.number().int().min(1).max(HARD_MAX_CHARS).optional(),
    },
    async ({ max_chars = DEFAULT_MAX_CHARS }) => {
      try {
        return textResult(await getClipboard(max_chars, config));
      } catch (error) {
        return textResult(error.message, true);
      }
    }
  );

  server.tool(
    "clipboard_set",
    "Set Windows clipboard text using a Unicode-safe exact roundtrip.",
    {
      text: z.string().max(MAX_SET_CHARS),
    },
    async ({ text }) => {
      try {
        const result = await setClipboard(text, config);
        if (!result?.ok || !result?.exact) {
          throw new Error("Clipboard set readback did not exactly match the requested text.");
        }
        return textResult({
          ok: true,
          state: "text",
          chars: Number(result.chars ?? text.length),
          exact: true,
        });
      } catch (error) {
        return textResult(error.message, true);
      }
    }
  );

  server.tool(
    "clipboard_clear",
    "Clear the Windows clipboard and verify that it is empty.",
    {},
    async () => {
      try {
        const result = await clearClipboard(config);
        if (!result?.ok) {
          throw new Error("Clipboard clear verification did not reach an empty state.");
        }
        return textResult({
          ok: true,
          state: "empty",
          format_count: Number(result.format_count ?? 0),
        });
      } catch (error) {
        return textResult(error.message, true);
      }
    }
  );
}
