import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => typeof value === "string")
);
env.MCP_ENABLE_POWERSHELL = "true";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["lconnect-mcp.mjs"],
  cwd: root,
  env,
  stderr: "pipe",
});

let stderr = "";
transport.stderr?.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

const client = new Client(
  { name: "lconnect-services-smoke", version: "1.0.2" },
  { capabilities: {} }
);

function textOf(result) {
  return result.content?.find((item) => item.type === "text")?.text ?? "";
}

function parseJsonResult(result, toolName, allowError = false) {
  const text = textOf(result);
  if (result.isError && !allowError) {
    throw new Error(`${toolName} returned isError: ${text}`);
  }
  try {
    return { data: JSON.parse(text), isError: Boolean(result.isError) };
  } catch (error) {
    throw new Error(`${toolName} returned non-JSON output: ${text}\n${error.message}`);
  }
}

async function callJson(name, args = {}, allowError = false) {
  return parseJsonResult(
    await client.callTool({ name, arguments: args }),
    name,
    allowError
  );
}

async function runPowerShell(command, allowError = false) {
  const result = await client.callTool({
    name: "powershell_run",
    arguments: { command, cwd: root, timeout_seconds: 60 },
  });
  if (result.isError && !allowError) {
    throw new Error(`powershell_run fixture failed: ${textOf(result)}`);
  }
  return result;
}

const isCiWindows =
  process.platform === "win32" &&
  String(process.env.CI).toLowerCase() === "true";

const serviceName = `LConnectCiSvc_${process.pid}_${Date.now()}`;
const tempRoot = process.env.RUNNER_TEMP || process.env.TEMP || root;
const serviceExe = path.join(tempRoot, `${serviceName}.exe`);

try {
  await client.connect(transport);

  const listed = await callJson("list_services", { limit: 20 });
  if (!Array.isArray(listed.data.services) || listed.data.services.length === 0) {
    throw new Error("list_services returned no services");
  }

  const eventLog = await callJson("get_service", { name: "EventLog" });
  if (!eventLog.data.found || eventLog.data.service.name.toLowerCase() !== "eventlog") {
    throw new Error("get_service could not read the Windows EventLog service");
  }

  const missing = await callJson("get_service", {
    name: `LConnectDefinitelyMissing_${Date.now()}`,
  });
  if (missing.data.found) {
    throw new Error("get_service reported a nonexistent service as found");
  }

  console.log("list_services read-only: PASS");
  console.log("get_service exact-name read: PASS");
  console.log("get_service missing: PASS");

  if (isCiWindows) {
    const escapedExe = serviceExe.replace(/'/g, "''");
    const source = [
      "using System.ServiceProcess;",
      "public sealed class LConnectTestService : ServiceBase {",
      `  public LConnectTestService() { ServiceName = "${serviceName}"; CanStop = true; AutoLog = false; }`,
      "  protected override void OnStart(string[] args) { }",
      "  protected override void OnStop() { }",
      "  public static void Main() { ServiceBase.Run(new LConnectTestService()); }",
      "}",
    ].join("\n");
    const escapedSource = source.replace(/'/g, "''");

    const createScript = [
      `$src = '${escapedSource}'`,
      `$exe = '${escapedExe}'`,
      "if (Test-Path -LiteralPath $exe) { Remove-Item -LiteralPath $exe -Force }",
      "Add-Type -TypeDefinition $src -Language CSharp -ReferencedAssemblies 'System.ServiceProcess.dll' -OutputAssembly $exe -OutputType ConsoleApplication",
      `& "$env:SystemRoot\\System32\\sc.exe" create '${serviceName}' "binPath=" $exe "start=" "demand"`,
      "if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }",
    ].join("; ");

    await runPowerShell(createScript);

    const created = await callJson("get_service", { name: serviceName });
    if (!created.data.found) {
      throw new Error("Disposable CI service was not visible after creation");
    }

    const delayed = await callJson("set_service_startup", {
      name: serviceName,
      startup_type: "automatic_delayed",
    });
    if (
      delayed.data.after?.start_mode.toLowerCase() !== "auto" ||
      delayed.data.after?.delayed_auto_start !== true
    ) {
      throw new Error(
        `automatic_delayed startup was not observed: ${JSON.stringify(delayed.data.after)}`
      );
    }

    const manual = await callJson("set_service_startup", {
      name: serviceName,
      startup_type: "manual",
    });
    if (manual.data.after?.start_mode.toLowerCase() !== "manual") {
      throw new Error("manual startup type was not observed");
    }

    const started = await callJson("start_service", {
      name: serviceName,
      wait_timeout_seconds: 20,
    });
    if (started.data.after?.state.toLowerCase() !== "running") {
      throw new Error("start_service did not reach Running");
    }

    const restarted = await callJson("restart_service", {
      name: serviceName,
      wait_timeout_seconds: 20,
    });
    if (restarted.data.after?.state.toLowerCase() !== "running") {
      throw new Error("restart_service did not return to Running");
    }

    const stopped = await callJson("stop_service", {
      name: serviceName,
      wait_timeout_seconds: 20,
    });
    if (stopped.data.after?.state.toLowerCase() !== "stopped") {
      throw new Error("stop_service did not reach Stopped");
    }

    const disabled = await callJson("set_service_startup", {
      name: serviceName,
      startup_type: "disabled",
    });
    if (disabled.data.after?.start_mode.toLowerCase() !== "disabled") {
      throw new Error("disabled startup type was not observed");
    }

    await callJson("set_service_startup", {
      name: serviceName,
      startup_type: "manual",
    });

    console.log("set_service_startup disposable CI service: PASS");
    console.log("start_service disposable CI service: PASS");
    console.log("restart_service disposable CI service: PASS");
    console.log("stop_service disposable CI service: PASS");
  }
} catch (error) {
  console.error("FAIL", error);
  if (stderr) console.error("\nServer stderr:\n" + stderr);
  process.exitCode = 1;
} finally {
  if (isCiWindows) {
    const escapedExe = serviceExe.replace(/'/g, "''");
    const cleanup = [
      `$name = '${serviceName}'`,
      "$svc = Get-Service | Where-Object { $_.Name -ieq $name } | Select-Object -First 1",
      "if ($null -ne $svc -and $svc.Status -ne 'Stopped') { try { Stop-Service -InputObject $svc -Force -ErrorAction Stop; $svc.WaitForStatus('Stopped',[TimeSpan]::FromSeconds(10)) } catch {} }",
      `& "$env:SystemRoot\\System32\\sc.exe" delete '${serviceName}' | Out-Null`,
      "Start-Sleep -Milliseconds 300",
      `if (Test-Path -LiteralPath '${escapedExe}') { Remove-Item -LiteralPath '${escapedExe}' -Force -ErrorAction SilentlyContinue }`,
    ].join("; ");
    await runPowerShell(cleanup, true).catch(() => {});
  }

  await transport.close();
}
