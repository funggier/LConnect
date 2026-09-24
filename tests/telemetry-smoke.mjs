import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => typeof value === "string")
);
env.MCP_ENABLE_POWERSHELL = "false";
env.LCONNECT_TELEMETRY_ENABLED = "true";
env.LCONNECT_TELEMETRY_MAX_EVENTS = "4";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["lconnect-mcp.mjs"],
  cwd: root,
  env,
  stderr: "pipe",
});

const client = new Client(
  { name: "lconnect-telemetry-smoke", version: "1.1.0" },
  { capabilities: {} }
);

function textOf(result) {
  return result.content?.find((item) => item.type === "text")?.text ?? "";
}

function jsonOf(result) {
  return JSON.parse(textOf(result));
}

async function call(name, args = {}) {
  return await client.callTool({ name, arguments: args });
}

try {
  await client.connect(transport);

  const initialClear = await call("tool_telemetry", { action: "clear" });
  if (initialClear.isError) throw new Error("Initial telemetry clear failed");

  // Generate more events than the configured ring capacity.
  await call("system_info");
  await call("list_sessions");
  await call("system_info");
  await call("list_sessions");
  await call("system_info");

  const secretMarker = "__LCONNECT_SECRET_ARGUMENT_MUST_NOT_BE_RECORDED__";
  const errorResult = await call("read_text_file", {
    path: path.join(root, secretMarker + ".txt"),
  });
  if (!errorResult.isError) {
    throw new Error("Expected read_text_file fixture to return an error");
  }

  const snapshotResult = await call("tool_telemetry", {
    action: "snapshot",
    limit: 10,
    include_events: true,
  });
  if (snapshotResult.isError) throw new Error("Telemetry snapshot failed");

  const snapshot = jsonOf(snapshotResult);

  if (!snapshot.enabled) throw new Error("Telemetry unexpectedly disabled");
  if (snapshot.max_events !== 10) {
    // Config parser intentionally enforces a safe minimum of 10.
    throw new Error(`Telemetry max_events unexpected: ${snapshot.max_events}`);
  }

  // Generate enough additional calls to force overflow at the normalized min=10.
  for (let i = 0; i < 8; i += 1) {
    await call(i % 2 === 0 ? "system_info" : "list_sessions");
  }

  const overflowResult = await call("tool_telemetry", {
    action: "snapshot",
    limit: 20,
    include_events: true,
  });
  const overflow = jsonOf(overflowResult);

  if (overflow.buffered_events > 10) {
    throw new Error(`Telemetry ring exceeded max size: ${overflow.buffered_events}`);
  }
  if (overflow.dropped_events < 1) {
    throw new Error("Telemetry ring overflow was not reported");
  }
  if (!Array.isArray(overflow.events) || !overflow.events.length) {
    throw new Error("Telemetry events missing");
  }

  const lastError = overflow.events
    .filter((event) => event.tool_name === "read_text_file")
    .at(-1);
  if (!lastError || !lastError.is_error) {
    throw new Error("Telemetry did not record error state");
  }

  const sample = overflow.events.find((event) => event.tool_name === "system_info");
  if (!sample) throw new Error("system_info telemetry missing");
  if (!Number.isFinite(sample.handler_elapsed_ms) || sample.handler_elapsed_ms < 0) {
    throw new Error(`Invalid handler_elapsed_ms: ${sample.handler_elapsed_ms}`);
  }
  if (!Number.isFinite(sample.result_bytes) || sample.result_bytes <= 0) {
    throw new Error(`Invalid result_bytes: ${sample.result_bytes}`);
  }
  if (sample.request_id === null || sample.request_id === undefined) {
    throw new Error("MCP request_id was not captured");
  }
  if (!sample.handler_started_at || !sample.handler_completed_at) {
    throw new Error("Telemetry timestamps missing");
  }

  const serialized = JSON.stringify(overflow);
  if (serialized.includes(secretMarker)) {
    throw new Error("Telemetry leaked tool argument content");
  }

  if (!Array.isArray(overflow.summary) || !overflow.summary.length) {
    throw new Error("Telemetry summary missing");
  }

  const clearResult = await call("tool_telemetry", { action: "clear" });
  const clear = jsonOf(clearResult);
  if (!clear.cleared || clear.previous_buffered_events < 1) {
    throw new Error("Telemetry clear did not report previous events");
  }

  const emptyResult = await call("tool_telemetry", {
    action: "snapshot",
    include_events: true,
  });
  const empty = jsonOf(emptyResult);
  if (empty.buffered_events !== 0 || empty.events.length !== 0 || empty.dropped_events !== 0) {
    throw new Error("Telemetry clear did not reset bounded state");
  }

  console.log("tool telemetry request/tool/timing/result-size: PASS");
  console.log("tool telemetry error state: PASS");
  console.log("tool telemetry argument redaction-by-design: PASS");
  console.log("tool telemetry bounded ring overflow: PASS");
  console.log("tool telemetry snapshot/clear: PASS");
} catch (error) {
  console.error("FAIL", error);
  process.exitCode = 1;
} finally {
  await transport.close().catch(() => {});
}
