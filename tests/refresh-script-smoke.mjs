import { spawn, execFileSync } from "node:child_process";
import fsp from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const script = path.join(root, "Refresh-LConnect.ps1");

if (process.platform !== "win32") {
  console.log("Refresh-LConnect offline reset: SKIP (Windows only)");
  process.exit(0);
}

let tempRoot = null;
let fakeTunnel = null;

function runRefresh(args = [], expectSuccess = true) {
  try {
    const output = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        script,
        "-RootPath",
        tempRoot,
        ...args,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    if (!expectSuccess) {
      throw new Error("Refresh unexpectedly succeeded while LConnect was running");
    }
    return { ok: true, output };
  } catch (error) {
    if (expectSuccess) {
      throw new Error(
        `Refresh failed unexpectedly: ${error.stderr?.toString?.() || error.message}`
      );
    }
    return {
      ok: false,
      output: (error.stdout?.toString?.() || "") + (error.stderr?.toString?.() || ""),
    };
  }
}

async function exists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

try {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "lconnect-refresh-smoke-"));
  const runtime = path.join(tempRoot, "runtime");
  const logs = path.join(tempRoot, "logs");
  const nodeModules = path.join(tempRoot, "node_modules");

  await fsp.mkdir(runtime, { recursive: true });
  await fsp.mkdir(logs, { recursive: true });
  await fsp.mkdir(nodeModules, { recursive: true });

  await fsp.writeFile(path.join(tempRoot, "mcp-conf.yaml"), "local-profile\n", "utf8");
  await fsp.writeFile(path.join(tempRoot, "lconnect-config.json"), "{\"fullMachineAccess\":true}\n", "utf8");
  await fsp.writeFile(path.join(tempRoot, "source.txt"), "source\n", "utf8");
  await fsp.writeFile(path.join(nodeModules, "keep.txt"), "dependency\n", "utf8");
  await fsp.writeFile(path.join(runtime, "launcher.pid"), "999999", "utf8");
  await fsp.writeFile(path.join(runtime, "health-url.txt"), "http://127.0.0.1:12345", "utf8");
  await fsp.writeFile(path.join(logs, "old.log"), "old evidence\n", "utf8");

  // Simulate a recorded running LConnect tunnel process using a copied cmd.exe.
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const cmdExe = path.join(systemRoot, "System32", "cmd.exe");
  const fakeTunnelPath = path.join(tempRoot, "tunnel-client.exe");
  await fsp.copyFile(cmdExe, fakeTunnelPath);

  fakeTunnel = spawn(
    fakeTunnelPath,
    ["/d", "/s", "/c", "ping -n 30 127.0.0.1 >nul"],
    { windowsHide: true, stdio: "ignore" }
  );
  await fsp.writeFile(path.join(runtime, "launcher.pid"), String(fakeTunnel.pid), "utf8");
  await new Promise((resolve) => setTimeout(resolve, 150));

  const refused = runRefresh([], false);
  if (!refused.output.includes("Stop-LConnect.cmd first")) {
    throw new Error(`Refresh running guard diagnostic missing: ${refused.output}`);
  }
  if (!(await exists(path.join(runtime, "health-url.txt")))) {
    throw new Error("Refresh modified runtime state even though running guard should refuse");
  }

  fakeTunnel.kill();
  await new Promise((resolve) => fakeTunnel.once("exit", resolve));
  fakeTunnel = null;

  // Default refresh clears runtime + logs and preserves local config/source/dependencies.
  runRefresh();

  const runtimeEntries = await fsp.readdir(runtime);
  const logEntries = await fsp.readdir(logs);
  if (runtimeEntries.length !== 0) throw new Error("runtime/ was not cleared");
  if (logEntries.length !== 0) throw new Error("logs/ was not cleared");

  for (const preserved of [
    path.join(tempRoot, "mcp-conf.yaml"),
    path.join(tempRoot, "lconnect-config.json"),
    path.join(tempRoot, "tunnel-client.exe"),
    path.join(tempRoot, "source.txt"),
    path.join(nodeModules, "keep.txt"),
  ]) {
    if (!(await exists(preserved))) {
      throw new Error(`Refresh removed preserved path: ${preserved}`);
    }
  }

  // KeepLogs keeps evidence while still resetting runtime.
  await fsp.writeFile(path.join(runtime, "stale.pid"), "123", "utf8");
  await fsp.writeFile(path.join(logs, "keep.log"), "keep evidence\n", "utf8");
  runRefresh(["-KeepLogs"]);

  if ((await fsp.readdir(runtime)).length !== 0) {
    throw new Error("runtime/ was not cleared with -KeepLogs");
  }
  if (!(await exists(path.join(logs, "keep.log")))) {
    throw new Error("-KeepLogs did not preserve logs");
  }

  const cmdText = await fsp.readFile(path.join(root, "Refresh-LConnect.cmd"), "utf8");
  if (!cmdText.includes("Refresh-LConnect.ps1") || !cmdText.includes("%*")) {
    throw new Error("Refresh-LConnect.cmd does not invoke PowerShell refresh with argument passthrough");
  }

  console.log("Refresh-LConnect running guard: PASS");
  console.log("Refresh-LConnect runtime/log cleanup: PASS");
  console.log("Refresh-LConnect preserves config/source/dependencies: PASS");
  console.log("Refresh-LConnect -KeepLogs: PASS");
  console.log("Refresh-LConnect.cmd passthrough: PASS");
} catch (error) {
  console.error("FAIL", error);
  process.exitCode = 1;
} finally {
  if (fakeTunnel) {
    try { fakeTunnel.kill(); } catch {}
  }
  if (tempRoot) {
    await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
}
