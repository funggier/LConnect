import fsp from "node:fs/promises";
import os from "node:os";
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
  { name: "lconnect-scheduled-tasks-smoke", version: "1.0.2" },
  { capabilities: {} }
);

const isCiWindows =
  process.platform === "win32" &&
  String(process.env.CI).toLowerCase() === "true";

const taskPath = "\\LConnectTests\\";
const taskName = `LConnectScheduledTaskTest_${process.pid}_${Date.now()}`;
let tempRoot = null;
let markerPath = null;
let created = false;

function textOf(result) {
  return result.content?.find((item) => item.type === "text")?.text ?? "";
}

async function callJson(name, args = {}, allowError = false) {
  const result = await client.callTool({ name, arguments: args });
  const text = textOf(result);
  if (result.isError && !allowError) {
    throw new Error(`${name} returned isError: ${text}`);
  }
  try {
    return { data: JSON.parse(text), isError: Boolean(result.isError) };
  } catch (error) {
    if (result.isError && allowError) {
      return { data: text, isError: true };
    }
    throw new Error(`${name} returned non-JSON output: ${text}\n${error.message}`);
  }
}

async function callPowerShell(command, allowError = false) {
  const result = await client.callTool({
    name: "powershell_run",
    arguments: { command, cwd: root, timeout_seconds: 60 },
  });
  if (result.isError && !allowError) {
    throw new Error(`powershell_run failed: ${textOf(result)}`);
  }
  return result;
}

async function waitForFile(filePath, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await fsp.access(filePath);
      return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function waitForTaskState(expected, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await callJson("get_scheduled_task", {
      task_name: taskName,
      task_path: taskPath,
    });
    if (result.data.found && String(result.data.task.state).toLowerCase() === expected.toLowerCase()) {
      return result.data.task;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for scheduled task state=${expected}`);
}

try {
  await client.connect(transport);

  const listed = await callJson("list_scheduled_tasks", { limit: 25 });
  if (!Array.isArray(listed.data.tasks)) {
    throw new Error("list_scheduled_tasks did not return tasks array");
  }

  if (listed.data.tasks.length > 0) {
    const first = listed.data.tasks[0];
    const exact = await callJson("get_scheduled_task", {
      task_name: first.task_name,
      task_path: first.task_path,
    });
    if (
      !exact.data.found ||
      exact.data.task.task_name !== first.task_name ||
      exact.data.task.task_path !== first.task_path
    ) {
      throw new Error("get_scheduled_task exact identity did not match list result");
    }
  }

  const missing = await callJson("get_scheduled_task", {
    task_name: `LConnectDefinitelyMissing_${Date.now()}`,
    task_path: "\\",
  });
  if (missing.data.found) {
    throw new Error("get_scheduled_task reported nonexistent task as found");
  }

  console.log("list_scheduled_tasks read-only: PASS");
  console.log("get_scheduled_task exact/missing: PASS");

  if (isCiWindows) {
    tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "lconnect-scheduled-task-smoke-"));
    markerPath = path.join(tempRoot, "task-started.txt");

    const powerShellExe = path.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe"
    );
    const markerPs = markerPath.replace(/'/g, "''");
    const actionArgs =
      `-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Set-Content -LiteralPath '${markerPs}' -Value 'started'; Start-Sleep -Seconds 20"`;
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const createdTask = await callJson("create_scheduled_task", {
      task_name: taskName,
      task_path: taskPath,
      executable: powerShellExe,
      arguments: actionArgs,
      working_directory: tempRoot,
      description: "Disposable LConnect Scheduled Tasks CI fixture",
      trigger_type: "once",
      at: future,
      run_level: "limited",
    });

    if (!createdTask.data.found || createdTask.data.task.task_name !== taskName) {
      throw new Error(`create_scheduled_task failed: ${JSON.stringify(createdTask.data)}`);
    }
    created = true;

    const filtered = await callJson("list_scheduled_tasks", {
      task_path: taskPath,
      name_contains: taskName,
      limit: 10,
    });
    if (!filtered.data.tasks.some((item) => item.task_name === taskName)) {
      throw new Error("list_scheduled_tasks did not find disposable task");
    }

    const disabled = await callJson("disable_scheduled_task", {
      task_name: taskName,
      task_path: taskPath,
    });
    if (!disabled.data.ok) throw new Error("disable_scheduled_task did not report success");
    await waitForTaskState("Disabled");

    const enabled = await callJson("enable_scheduled_task", {
      task_name: taskName,
      task_path: taskPath,
    });
    if (!enabled.data.ok) throw new Error("enable_scheduled_task did not report success");
    await waitForTaskState("Ready");

    const run = await callJson("run_scheduled_task", {
      task_name: taskName,
      task_path: taskPath,
    });
    if (!run.data.ok) throw new Error("run_scheduled_task did not report success");

    if (!(await waitForFile(markerPath))) {
      throw new Error("Scheduled task action did not create the marker file");
    }

    await waitForTaskState("Running");

    const stopped = await callJson("stop_scheduled_task", {
      task_name: taskName,
      task_path: taskPath,
    });
    if (!stopped.data.ok) throw new Error("stop_scheduled_task did not report success");
    await waitForTaskState("Ready");

    const deleted = await callJson("delete_scheduled_task", {
      task_name: taskName,
      task_path: taskPath,
    });
    if (!deleted.data.ok || !deleted.data.deleted) {
      throw new Error("delete_scheduled_task did not report deletion");
    }
    created = false;

    const gone = await callJson("get_scheduled_task", {
      task_name: taskName,
      task_path: taskPath,
    });
    if (gone.data.found) {
      throw new Error("Deleted scheduled task is still present");
    }

    console.log("create_scheduled_task disposable CI task: PASS");
    console.log("disable/enable scheduled task: PASS");
    console.log("run_scheduled_task marker action: PASS");
    console.log("stop_scheduled_task: PASS");
    console.log("delete_scheduled_task: PASS");
  }
} catch (error) {
  console.error("FAIL", error);
  if (stderr) console.error("\nServer stderr:\n" + stderr);
  process.exitCode = 1;
} finally {
  if (created) {
    await callJson("delete_scheduled_task", {
      task_name: taskName,
      task_path: taskPath,
    }, true).catch(() => {});
  }

  if (isCiWindows) {
    await callPowerShell(
      [
        "$scheduler = New-Object -ComObject Schedule.Service",
        "$scheduler.Connect()",
        "$root = $scheduler.GetFolder('\\')",
        "try { $root.DeleteFolder('LConnectTests', 0) } catch {}",
      ].join("; "),
      true
    ).catch(() => {});
  }

  await transport.close().catch(() => {});
  if (tempRoot) {
    await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
}
