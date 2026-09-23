import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => typeof value === "string")
);
env.MCP_ENABLE_POWERSHELL = "true";
env.LCONNECT_MAX_SYNCHRONOUS_REQUEST_SECONDS = "1";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["lconnect-mcp.mjs"],
  cwd: root,
  env,
  stderr: "pipe",
});

const client = new Client(
  { name: "lconnect-timeout-containment-smoke", version: "1.1.0" },
  { capabilities: {} }
);

let server = null;
let managedSessionId = null;

function textOf(result) {
  return result.content?.find((item) => item.type === "text")?.text ?? "";
}

function jsonOf(result) {
  return JSON.parse(textOf(result));
}

try {
  await client.connect(transport);

  // A synchronous shell call requesting 5 seconds must be contained by the
  // configured 1-second MCP request budget.
  const shellStarted = Date.now();
  const shell = await client.callTool({
    name: "powershell_run",
    arguments: {
      command: "Start-Sleep -Seconds 5; Write-Output 'late'",
      timeout_seconds: 5,
    },
  });
  const shellElapsed = Date.now() - shellStarted;

  if (!shell.isError) {
    throw new Error("powershell_run was not bounded by MCP synchronous request budget");
  }
  if (shellElapsed > 3000) {
    throw new Error(`powershell_run exceeded expected request budget window: ${shellElapsed} ms`);
  }
  if (!textOf(shell).includes("timed out")) {
    throw new Error(`powershell_run timeout evidence missing: ${textOf(shell)}`);
  }

  // Managed sessions are intentionally outside the synchronous request budget.
  const startStarted = Date.now();
  const managed = await client.callTool({
    name: "start_process",
    arguments: {
      program: process.execPath,
      args: ["-e", "setTimeout(()=>process.exit(0),2500)"],
      cwd: root,
      label: "timeout-containment-managed-session",
    },
  });
  const startElapsed = Date.now() - startStarted;
  if (managed.isError) throw new Error(`start_process failed: ${textOf(managed)}`);
  const managedInfo = jsonOf(managed);
  managedSessionId = managedInfo.session_id;
  if (startElapsed > 1500 || !managedInfo.running) {
    throw new Error(`start_process did not return promptly with running session: ${textOf(managed)}`);
  }

  const wait = await client.callTool({
    name: "wait_session",
    arguments: {
      session_id: managedSessionId,
      timeout_seconds: 0.2,
      poll_interval_ms: 25,
      include_output_tail: false,
    },
  });
  if (wait.isError) throw new Error(`wait_session failed: ${textOf(wait)}`);
  const waitInfo = jsonOf(wait);
  if (!waitInfo.running || !waitInfo.timed_out || waitInfo.completed) {
    throw new Error(`wait_session did not preserve running work: ${textOf(wait)}`);
  }
  if (waitInfo.return_reason !== "timeout") {
    throw new Error(`wait_session return_reason missing/wrong: ${textOf(wait)}`);
  }
  if (!Number.isFinite(waitInfo.waited_ms) || waitInfo.waited_ms < 100 || waitInfo.waited_ms > 1500) {
    throw new Error(`wait_session waited_ms invalid: ${textOf(wait)}`);
  }

  // HTTP budget must cover body wait, not only receipt of response headers.
  server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.flushHeaders?.();
    setTimeout(() => res.end("late-body"), 3000);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/slow`;

  const httpStarted = Date.now();
  const httpResult = await client.callTool({
    name: "http_request",
    arguments: {
      url,
      timeout_ms: 5000,
      body_mode: "text",
    },
  });
  const httpElapsed = Date.now() - httpStarted;

  if (!httpResult.isError) {
    throw new Error(`http_request was not bounded by MCP synchronous request budget: ${textOf(httpResult)}`);
  }
  if (httpElapsed > 3000) {
    throw new Error(`http_request exceeded expected request budget window: ${httpElapsed} ms`);
  }
  if (!textOf(httpResult).includes("timed out")) {
    throw new Error(`http_request timeout evidence missing: ${textOf(httpResult)}`);
  }

  // The managed process must still reach terminal state after the earlier short wait timeout.
  await new Promise((resolve) => setTimeout(resolve, 2600));
  const final = await client.callTool({
    name: "wait_session",
    arguments: {
      session_id: managedSessionId,
      timeout_seconds: 0,
      include_output_tail: false,
    },
  });
  if (final.isError) throw new Error(`final wait_session failed: ${textOf(final)}`);
  const finalInfo = jsonOf(final);
  if (!finalInfo.completed || finalInfo.running || finalInfo.exit_code !== 0) {
    throw new Error(`managed process did not outlive request timeout: ${textOf(final)}`);
  }

  console.log("synchronous shell request budget: PASS");
  console.log("managed process outlives short MCP wait: PASS");
  console.log("wait_session timeout evidence: PASS");
  console.log("HTTP full-operation timeout budget: PASS");
} catch (error) {
  console.error("FAIL", error);
  process.exitCode = 1;
} finally {
  if (managedSessionId) {
    await client.callTool({
      name: "terminate_process",
      arguments: { session_id: managedSessionId },
    }).catch(() => {});
  }
  await transport.close().catch(() => {});
  if (server) {
    await new Promise((resolve) => server.close(resolve)).catch(() => {});
  }
}
