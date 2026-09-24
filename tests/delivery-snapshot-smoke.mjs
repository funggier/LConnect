import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  buildDeliverySnapshot,
  registerDeliverySnapshotTool,
  summarizeDeliveryMetrics,
} from "../modules/delivery-snapshot.mjs";

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "lconnect-delivery-snapshot-"));
const runtimeDir = path.join(fixture, "runtime");
fs.mkdirSync(runtimeDir, { recursive: true });

const metrics = [
  '# HELP command_end_to_end_latency_milliseconds fixture',
  'command_end_to_end_latency_milliseconds_sum{request_method="tools/call",latency_type="enqueue_to_response",tunnel_id="SHOULD_NOT_LEAK"} 2500',
  'command_end_to_end_latency_milliseconds_count{request_method="tools/call",latency_type="enqueue_to_response",tunnel_id="SHOULD_NOT_LEAK"} 5',
  'command_end_to_end_latency_milliseconds_sum{request_method="tools/call",latency_type="poll_to_response",tunnel_id="SHOULD_NOT_LEAK"} 3600',
  'command_end_to_end_latency_milliseconds_count{request_method="tools/call",latency_type="poll_to_response",tunnel_id="SHOULD_NOT_LEAK"} 6',
  'command_end_to_end_latency_milliseconds_sum{request_method="server/discover",latency_type="poll_to_response",tunnel_id="SHOULD_NOT_LEAK"} 300',
  'command_end_to_end_latency_milliseconds_count{request_method="server/discover",latency_type="poll_to_response",tunnel_id="SHOULD_NOT_LEAK"} 1',
  'http_client_request_duration_seconds_sum{http_request_method="POST",http_route="/v1/tunnels/SHOULD_NOT_LEAK/response",http_response_status_code="200"} 0.6',
  'http_client_request_duration_seconds_count{http_request_method="POST",http_route="/v1/tunnels/SHOULD_NOT_LEAK/response",http_response_status_code="200"} 3',
  'http_client_request_duration_seconds_sum{http_request_method="GET",http_route="/v1/tunnels/SHOULD_NOT_LEAK/poll",http_response_status_code="200"} 4',
  'http_client_request_duration_seconds_count{http_request_method="GET",http_route="/v1/tunnels/SHOULD_NOT_LEAK/poll",http_response_status_code="200"} 2',
  'commands_enqueued_total{} 10',
  'commands_polled_total{} 9',
  'commands_poll_cycles_total{} 12',
  'commands_queue_length{} 1',
  'dispatcher_worker_pool_capacity{} 10',
  'dispatcher_worker_pool_occupancy{} 2',
  '',
].join("\n") + "\n# filler " + "x".repeat(605000);

const fixtureServer = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("live");
    return;
  }
  if (req.url === "/readyz") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ready");
    return;
  }
  if (req.url === "/metrics") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(metrics);
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
});

await new Promise((resolve, reject) => {
  fixtureServer.once("error", reject);
  fixtureServer.listen(0, "127.0.0.1", resolve);
});

const address = fixtureServer.address();
if (!address || typeof address === "string") {
  throw new Error("fixture server address unavailable");
}

const baseUrl = "http://127.0.0.1:" + address.port;
fs.writeFileSync(path.join(runtimeDir, "health-url.txt"), baseUrl, "utf8");

const config = {
  installRoot: fixture,
};

let pair;
try {
  const direct = await buildDeliverySnapshot(config, {
    afterSeq: 0,
    telemetryLimit: 10,
    includeTelemetryEvents: false,
  });

  if (!direct.available) throw new Error("delivery snapshot unexpectedly unavailable");
  if (
    direct.endpoint.host !== "127.0.0.1" ||
    direct.endpoint.port !== address.port ||
    direct.endpoint.loopback !== true
  ) {
    throw new Error("runtime endpoint discovery failed");
  }

  if (
    !direct.health.liveness.ok ||
    !direct.health.readiness.ok ||
    direct.health.mcp_component.available !== false ||
    direct.health.detailed.available !== false
  ) {
    throw new Error("health capability evidence failed");
  }

  const enqueue = direct.tunnel_metrics.tools_call.enqueue_to_response_ms;
  const poll = direct.tunnel_metrics.tools_call.poll_to_response_ms;
  const discover = direct.tunnel_metrics.server_discover_poll_to_response_ms;
  const responsePost = direct.tunnel_metrics.http.response_post_ms;
  const pollGet = direct.tunnel_metrics.http.poll_get_long_poll_duration_ms;

  if (
    enqueue.count !== 5 || enqueue.sum !== 2500 || enqueue.average !== 500 ||
    poll.count !== 6 || poll.sum !== 3600 || poll.average !== 600 ||
    discover.count !== 1 || discover.average !== 300 ||
    responsePost.count !== 3 || responsePost.average !== 200 ||
    pollGet.count !== 2 || pollGet.average !== 2000
  ) {
    throw new Error("latency aggregate parsing failed");
  }

  if (
    direct.tunnel_metrics.dispatcher.queue_length !== 1 ||
    direct.tunnel_metrics.dispatcher.worker_pool_capacity !== 10 ||
    direct.tunnel_metrics.dispatcher.worker_pool_occupancy !== 2 ||
    direct.tunnel_metrics.control_plane.commands_enqueued_total !== 10 ||
    direct.tunnel_metrics.control_plane.commands_polled_total !== 9 ||
    direct.tunnel_metrics.control_plane.commands_poll_cycles_total !== 12
  ) {
    throw new Error("queue/control-plane aggregate parsing failed");
  }

  const serialized = JSON.stringify(direct);
  if (serialized.includes("SHOULD_NOT_LEAK")) {
    throw new Error("raw tunnel label leaked into delivery snapshot");
  }

  if (
    !direct.warnings.some((x) => x.includes("/health/mcp")) ||
    !direct.warnings.some((x) => x.includes("detailed health"))
  ) {
    throw new Error("optional capability gap warnings missing");
  }
  if (!direct.warnings.some((x) => x.includes("metrics response") && x.includes("truncated"))) {
    throw new Error("streaming metrics bound/truncation evidence missing");
  }

  const mcpServer = new McpServer({
    name: "LConnect Delivery Snapshot Test",
    version: "1.1.0",
  });
  registerDeliverySnapshotTool(mcpServer, config);

  pair = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "lconnect-delivery-snapshot-smoke", version: "1.1.0" },
    { capabilities: {} }
  );
  await mcpServer.connect(pair[1]);
  await client.connect(pair[0]);

  const toolResult = await client.callTool({
    name: "delivery_snapshot",
    arguments: {
      telemetry_limit: 10,
      include_telemetry_events: false,
    },
  });
  if (toolResult.isError) {
    throw new Error("delivery_snapshot tool returned isError");
  }
  const toolText = toolResult.content?.find((x) => x.type === "text")?.text || "";
  const toolData = JSON.parse(toolText);
  if (!toolData.available || toolData.tunnel_metrics.tools_call.enqueue_to_response_ms.count !== 5) {
    throw new Error("delivery_snapshot registered tool contract failed");
  }

  const badRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lconnect-delivery-bad-"));
  fs.mkdirSync(path.join(badRoot, "runtime"), { recursive: true });
  fs.writeFileSync(
    path.join(badRoot, "runtime", "health-url.txt"),
    "http://example.com:18020",
    "utf8"
  );
  const denied = await buildDeliverySnapshot({ installRoot: badRoot });
  if (
    denied.available !== false ||
    !denied.warnings.some((x) => x.includes("loopback HTTP"))
  ) {
    throw new Error("non-loopback endpoint was not rejected");
  }
  fs.rmSync(badRoot, { recursive: true, force: true });

  const helper = summarizeDeliveryMetrics([
    { name: "commands_queue_length", labels: {}, value: 7 },
  ]);
  if (helper.dispatcher.queue_length !== 7) {
    throw new Error("summarizeDeliveryMetrics helper failed");
  }

  console.log("delivery_snapshot runtime URL discovery: PASS");
  console.log("delivery_snapshot loopback guard: PASS");
  console.log("delivery_snapshot health capability detection: PASS");
  console.log("delivery_snapshot latency aggregation: PASS");
  console.log("delivery_snapshot queue/control-plane aggregation: PASS");
  console.log("delivery_snapshot tunnel-label omission: PASS");
  console.log("delivery_snapshot streaming metrics bound: PASS");
  console.log("delivery_snapshot registered tool: PASS");
} finally {
  if (pair) {
    await pair[0].close().catch(() => {});
  }
  await new Promise((resolve) => fixtureServer.close(resolve));
  fs.rmSync(fixture, { recursive: true, force: true });
}
