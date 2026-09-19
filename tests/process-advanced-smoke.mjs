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
  { name: "lconnect-process-advanced-smoke", version: "1.1.0" },
  { capabilities: {} }
);

const cleanupPids = new Set();

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

async function startTrackedNode(code) {
  const result = await callJson("start_process", {
    program: process.execPath,
    args: ["-e", code],
    cwd: root,
  });
  cleanupPids.add(result.data.pid);
  return result.data;
}

async function killBestEffort(pid, tree = true) {
  try {
    await client.callTool({
      name: "kill_process",
      arguments: { pid, force: true, tree },
    });
  } catch {}
}

async function waitForSessionOutput(sessionId, predicate, timeoutMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await callJson("read_process_output", { session_id: sessionId });
    if (predicate(result.data.stdout || "")) return result.data;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for output from ${sessionId}`);
}

function treeContainsPid(node, pid) {
  if (!node) return false;
  if (node.pid === pid) return true;
  return Array.isArray(node.children) && node.children.some((child) => treeContainsPid(child, pid));
}

const marker = `LCONNECT_PROC_ADV_${process.pid}_${Date.now()}`;

try {
  await client.connect(transport);

  const parent = await startTrackedNode(
    `const {spawn}=require('node:child_process'); const marker='${marker}'; const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); console.log(c.pid); setInterval(()=>{},1000);`
  );

  const parentOutput = await waitForSessionOutput(
    parent.session_id,
    (stdout) => /^\s*\d+/m.test(stdout)
  );
  const childPidMatch = (parentOutput.stdout || "").match(/^(\d+)/m);
  if (!childPidMatch) throw new Error("Could not parse child PID from fixture");
  const childPid = Number(childPidMatch[1]);
  cleanupPids.add(childPid);

  const details = await callJson("process_details", { pid: parent.pid });
  if (!details.data.found || details.data.process.pid !== parent.pid) {
    throw new Error("process_details did not return the fixture process");
  }
  if (!details.data.process.creation_time) {
    throw new Error("process_details did not return creation_time identity");
  }
  const parentCreation = details.data.process.creation_time;

  const foundByPid = await callJson("find_process", { pid: parent.pid, limit: 10 });
  if (foundByPid.data.count !== 1 || foundByPid.data.processes[0]?.pid !== parent.pid) {
    throw new Error("find_process PID filter failed");
  }

  const foundByMarker = await callJson("find_process", {
    command_line_contains: marker,
    limit: 10,
  });
  if (!foundByMarker.data.processes.some((item) => item.pid === parent.pid)) {
    throw new Error("find_process command_line_contains filter failed");
  }

  const tree = await callJson("process_tree", { pid: parent.pid, max_depth: 4 });
  if (!tree.data.found || !treeContainsPid(tree.data.root, childPid)) {
    throw new Error("process_tree did not include the fixture child process");
  }

  const boundedWait = await callJson("wait_process", {
    pid: parent.pid,
    expected_creation_time: parentCreation,
    timeout_seconds: 0,
  });
  if (!boundedWait.data.timed_out || boundedWait.data.exited) {
    throw new Error("wait_process zero-second bounded wait did not report timeout on a live process");
  }

  const identityMismatch = await callJson("wait_process", {
    pid: parent.pid,
    expected_creation_time: "2000-01-01T00:00:00.000Z",
    timeout_seconds: 1,
  });
  if (!identityMismatch.data.identity_mismatch || identityMismatch.data.reason !== "pid_reused") {
    throw new Error("wait_process did not protect against PID identity mismatch");
  }

  const short = await startTrackedNode("setTimeout(()=>{},2000)");
  const shortDetails = await callJson("process_details", { pid: short.pid });
  if (!shortDetails.data.found) throw new Error("short fixture disappeared before identity capture");

  const waitedExit = await callJson("wait_process", {
    pid: short.pid,
    expected_creation_time: shortDetails.data.process.creation_time,
    timeout_seconds: 5,
    poll_interval_ms: 150,
  });
  if (!waitedExit.data.exited || waitedExit.data.timed_out) {
    throw new Error("wait_process did not observe natural process exit");
  }
  cleanupPids.delete(short.pid);

  const restartFixture = await startTrackedNode("setTimeout(()=>{},10000)");
  const restartDetails = await callJson("process_details", { pid: restartFixture.pid });
  if (!restartDetails.data.found) throw new Error("restart fixture missing before test");

  const rejectedRestart = await callJson("restart_process", {
    pid: restartFixture.pid,
    expected_creation_time: "2000-01-01T00:00:00.000Z",
    program: process.execPath,
    args: ["-e", "setTimeout(()=>{},10000)"],
    cwd: root,
  }, true);

  if (!rejectedRestart.isError || rejectedRestart.data.reason !== "pid_reused") {
    throw new Error("restart_process did not reject mismatched PID identity");
  }

  const stillThere = await callJson("process_details", { pid: restartFixture.pid });
  if (!stillThere.data.found) {
    throw new Error("restart_process identity mismatch killed the original process");
  }

  const restarted = await callJson("restart_process", {
    pid: restartFixture.pid,
    expected_creation_time: restartDetails.data.process.creation_time,
    program: process.execPath,
    args: ["-e", "setTimeout(()=>{},10000)"],
    cwd: root,
    force: true,
    tree: false,
    wait_timeout_seconds: 5,
  });

  if (!restarted.data.restarted || restarted.data.new_pid === restartFixture.pid) {
    throw new Error("restart_process did not return a new process PID");
  }

  cleanupPids.delete(restartFixture.pid);
  cleanupPids.add(restarted.data.new_pid);

  const newDetails = await callJson("process_details", { pid: restarted.data.new_pid });
  if (!newDetails.data.found) {
    throw new Error("restarted process was not observable after relaunch");
  }

  console.log("process_details identity: PASS");
  console.log("find_process PID/filter: PASS");
  console.log("process_tree parent/child: PASS");
  console.log("wait_process bounded timeout: PASS");
  console.log("wait_process PID-reuse guard: PASS");
  console.log("wait_process natural exit: PASS");
  console.log("restart_process PID-reuse guard: PASS");
  console.log("restart_process explicit relaunch: PASS");
} catch (error) {
  console.error("FAIL", error);
  if (stderr) console.error("\nServer stderr:\n" + stderr);
  process.exitCode = 1;
} finally {
  for (const pid of cleanupPids) {
    await killBestEffort(pid, true);
  }
  await transport.close();
}
