import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(Object.entries(process.env).filter(([,v]) => typeof v === "string"));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["lconnect-mcp.mjs"],
  cwd: root,
  env,
  stderr: "pipe",
});
const client = new Client({ name: "lconnect-window-control-smoke", version: "1.0.0" }, { capabilities: {} });
let serverStderr = "";
transport.stderr?.on("data", c => { serverStderr += c.toString("utf8"); });

function textOf(result) {
  return result.content?.find(item => item.type === "text")?.text ?? "";
}

async function callJson(name, args = {}, allowError = false) {
  const result = await client.callTool({ name, arguments: args });
  const text = textOf(result);
  if (result.isError && !allowError) throw new Error(`${name} failed: ${text}`);
  if (result.isError && allowError) return { isError: true, text };
  return { isError: false, data: JSON.parse(text) };
}

function encodedPowerShell(script) {
  return Buffer.from(script, "utf16le").toString("base64");
}

async function waitForFixture(title, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const listed = await callJson("list_windows", { title_contains: title, visible_only: true, limit: 20 });
    const found = listed.data.windows.find(w => w.title === title);
    if (found) return found;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error("Timed out waiting for fixture window");
}

let fixture = null;

try {
  await client.connect(transport);

  const listed = await callJson("list_windows", { visible_only: true, limit: 50 });
  if (!Array.isArray(listed.data.windows)) throw new Error("list_windows did not return windows array");
  console.log("list_windows read-only: PASS");

  const missing = await callJson("get_window", { hwnd: "0x7FFFFFFFFFFFFFFF" });
  if (missing.data.found !== false) throw new Error("get_window missing HWND did not report found=false");
  console.log("get_window missing HWND: PASS");

  if (process.platform !== "win32") {
    console.log("window mutation fixture skipped: non-Windows");
  } else {
    const title = `LConnectWindowFixture_${process.pid}_${Date.now()}`;
    const ps = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "Add-Type -AssemblyName System.Drawing",
      "$f = New-Object System.Windows.Forms.Form",
      `$f.Text = '${title.replace(/'/g, "''")}'`,
      "$f.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual",
      "$f.Location = [System.Drawing.Point]::new(120,140)",
      "$f.Size = [System.Drawing.Size]::new(520,340)",
      "$f.ShowInTaskbar = $true",
      "[System.Windows.Forms.Application]::Run($f)",
    ].join("; ");

    fixture = spawn("powershell.exe", [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-Sta", "-ExecutionPolicy", "Bypass",
      "-EncodedCommand", encodedPowerShell(ps),
    ], { cwd: root, windowsHide: false, stdio: "ignore" });

    const first = await waitForFixture(title);
    const hwnd = first.hwnd;
    const pid = first.pid;
    if (!/^0x[0-9A-F]+$/i.test(hwnd) || pid !== fixture.pid) {
      throw new Error(`fixture identity mismatch hwnd=${hwnd} listedPid=${pid} spawnedPid=${fixture.pid}`);
    }
    console.log("fixture HWND/PID identity: PASS");

    const exact = await callJson("get_window", { hwnd });
    if (!exact.data.found || exact.data.window.pid !== pid || exact.data.window.title !== title) {
      throw new Error("get_window exact identity mismatch");
    }
    console.log("get_window exact identity: PASS");

    const wrong = await callJson("move_window", { hwnd, expected_pid: pid + 100000, x: 200, y: 220 }, true);
    if (!wrong.isError || !wrong.text.includes("WINDOW_IDENTITY_MISMATCH")) {
      throw new Error(`expected_pid mismatch guard did not reject mutation: ${JSON.stringify(wrong)}`);
    }
    console.log("window expected_pid guard: PASS");

    const moved = await callJson("move_window", { hwnd, expected_pid: pid, x: 240, y: 260 });
    if (!moved.data.ok || moved.data.after.x !== 240 || moved.data.after.y !== 260) {
      throw new Error(`move_window mismatch: ${JSON.stringify(moved.data)}`);
    }
    console.log("move_window: PASS");

    const resized = await callJson("resize_window", { hwnd, expected_pid: pid, width: 640, height: 420 });
    if (!resized.data.ok || resized.data.after.width !== 640 || resized.data.after.height !== 420) {
      throw new Error(`resize_window mismatch: ${JSON.stringify(resized.data)}`);
    }
    console.log("resize_window: PASS");

    const minimized = await callJson("minimize_window", { hwnd, expected_pid: pid });
    if (!minimized.data.ok || !minimized.data.after.minimized) {
      throw new Error(`minimize_window mismatch: ${JSON.stringify(minimized.data)}`);
    }
    console.log("minimize_window: PASS");

    const maximized = await callJson("maximize_window", { hwnd, expected_pid: pid });
    if (!maximized.data.ok || !maximized.data.after.maximized) {
      throw new Error(`maximize_window mismatch: ${JSON.stringify(maximized.data)}`);
    }
    console.log("maximize_window: PASS");

    const focus = await callJson("focus_window", { hwnd, expected_pid: pid });
    if (focus.data.action !== "focus" || !focus.data.before || !("ok" in focus.data)) {
      throw new Error("focus_window did not return deterministic contract");
    }
    console.log(`focus_window contract: PASS (foreground=${focus.data.ok})`);

    const closed = await callJson("close_window", { hwnd, expected_pid: pid, wait_ms: 3000 });
    if (!closed.data.posted || !closed.data.closed || !closed.data.ok) {
      throw new Error(`close_window mismatch: ${JSON.stringify(closed.data)}`);
    }
    console.log("close_window WM_CLOSE: PASS");

    await new Promise(resolve => setTimeout(resolve, 150));
    const gone = await callJson("get_window", { hwnd });
    if (gone.data.found) throw new Error("closed fixture HWND still reported as found");
    console.log("closed HWND gone: PASS");
  }
} catch (error) {
  console.error("FAIL", error);
  if (serverStderr) console.error("\nServer stderr:\n" + serverStderr);
  process.exitCode = 1;
} finally {
  await transport.close().catch(() => {});
  if (fixture && fixture.exitCode == null) {
    try { fixture.kill(); } catch {}
  }
}
