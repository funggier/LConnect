import fsp from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { snapshotToolTelemetry } from "./telemetry.mjs";

function textResult(value, isError = false) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify(value, null, 2),
    }],
    ...(isError ? { isError: true } : {}),
  };
}

function isLoopbackHostname(hostname) {
  const normalized = String(hostname || "").toLowerCase();
  return normalized === "127.0.0.1" ||
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "[::1]";
}

function validateLoopbackBase(raw) {
  const parsed = new URL(String(raw || "").trim());
  if (parsed.protocol !== "http:" || !isLoopbackHostname(parsed.hostname)) {
    throw new Error("Runtime health endpoint must be loopback HTTP.");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed;
}

function decodePrometheusString(value) {
  return String(value || "")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\\\/g, "\\");
}

function parseLabels(raw = "") {
  const labels = {};
  const pattern = /([A-Za-z_][A-Za-z0-9_]*)="((?:\\.|[^"])*)"/g;
  let match;
  while ((match = pattern.exec(raw)) !== null) {
    labels[match[1]] = decodePrometheusString(match[2]);
  }
  return labels;
}

function parsePrometheus(text) {
  const rows = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Za-z_:][A-Za-z0-9_:]*)(?:\{(.*)\})?\s+([^\s]+)$/.exec(line);
    if (!match) continue;
    const value = Number(match[3]);
    if (!Number.isFinite(value)) continue;
    rows.push({
      name: match[1],
      labels: parseLabels(match[2] || ""),
      value,
    });
  }
  return rows;
}

function sumMetric(rows, name, predicate = () => true) {
  let found = false;
  let sum = 0;
  for (const row of rows) {
    if (row.name !== name || !predicate(row.labels)) continue;
    found = true;
    sum += row.value;
  }
  return found ? sum : null;
}

function histogramAggregate(rows, baseName, predicate = () => true, scale = 1) {
  const count = sumMetric(rows, baseName + "_count", predicate);
  const sum = sumMetric(rows, baseName + "_sum", predicate);
  if (count === null && sum === null) {
    return { available: false, count: 0, sum: 0, average: null };
  }
  const scaledSum = Number(sum || 0) * scale;
  return {
    available: true,
    count: Number(count || 0),
    sum: Math.round(scaledSum * 1000) / 1000,
    average:
      Number(count || 0) > 0
        ? Math.round((scaledSum / Number(count)) * 1000) / 1000
        : null,
  };
}

async function readResponseBodyBounded(response, maxBytes) {
  if (!response.body) {
    return { body: "", bytes: 0, truncated: false };
  }

  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      const remaining = Math.max(0, maxBytes - bytes);

      if (chunk.length <= remaining) {
        chunks.push(chunk);
        bytes += chunk.length;
        continue;
      }

      if (remaining > 0) {
        chunks.push(chunk.subarray(0, remaining));
        bytes += remaining;
      }
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }

  return {
    body: Buffer.concat(chunks, bytes).toString("utf8"),
    bytes,
    truncated,
  };
}

async function fetchBounded(url, {
  timeoutMs = 1500,
  maxBytes = 600000,
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      redirect: "error",
      headers: { accept: "text/plain, application/json;q=0.9, */*;q=0.1" },
    });
    const bounded = await readResponseBodyBounded(response, maxBytes);
    return {
      ok: response.ok,
      status: response.status,
      elapsed_ms: Math.round((performance.now() - started) * 1000) / 1000,
      truncated: bounded.truncated,
      body: bounded.body,
      bytes: bounded.bytes,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      elapsed_ms: Math.round((performance.now() - started) * 1000) / 1000,
      truncated: false,
      body: "",
      bytes: 0,
      error: error?.name === "AbortError" ? "timeout" : String(error?.message || error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function healthEvidence(result) {
  return {
    available: result.status !== 404 && result.status !== null,
    ok: Boolean(result.ok),
    status: result.status,
    elapsed_ms: result.elapsed_ms,
    ...(result.error ? { error: result.error } : {}),
  };
}

function routeEndsWith(value, suffix) {
  return typeof value === "string" && value.endsWith(suffix);
}

export function summarizeDeliveryMetrics(rows) {
  const toolsCall = (latencyType) =>
    histogramAggregate(
      rows,
      "command_end_to_end_latency_milliseconds",
      (labels) =>
        labels.request_method === "tools/call" &&
        labels.latency_type === latencyType,
      1
    );

  const discover = histogramAggregate(
    rows,
    "command_end_to_end_latency_milliseconds",
    (labels) =>
      labels.request_method === "server/discover" &&
      labels.latency_type === "poll_to_response",
    1
  );

  const httpResponse = histogramAggregate(
    rows,
    "http_client_request_duration_seconds",
    (labels) =>
      labels.http_request_method === "POST" &&
      routeEndsWith(labels.http_route, "/response"),
    1000
  );

  const httpPoll = histogramAggregate(
    rows,
    "http_client_request_duration_seconds",
    (labels) =>
      labels.http_request_method === "GET" &&
      routeEndsWith(labels.http_route, "/poll"),
    1000
  );

  return {
    tools_call: {
      enqueue_to_response_ms: toolsCall("enqueue_to_response"),
      poll_to_response_ms: toolsCall("poll_to_response"),
    },
    server_discover_poll_to_response_ms: discover,
    http: {
      response_post_ms: httpResponse,
      poll_get_long_poll_duration_ms: httpPoll,
    },
    dispatcher: {
      queue_length: sumMetric(rows, "commands_queue_length"),
      worker_pool_capacity: sumMetric(rows, "dispatcher_worker_pool_capacity"),
      worker_pool_occupancy: sumMetric(rows, "dispatcher_worker_pool_occupancy"),
    },
    control_plane: {
      commands_enqueued_total: sumMetric(rows, "commands_enqueued_total"),
      commands_polled_total: sumMetric(rows, "commands_polled_total"),
      commands_poll_cycles_total: sumMetric(rows, "commands_poll_cycles_total"),
    },
  };
}

export async function buildDeliverySnapshot(config, {
  afterSeq = 0,
  telemetryLimit = 50,
  includeTelemetryEvents = false,
} = {}) {
  const observedAt = new Date().toISOString();
  const warnings = [];
  const urlFile = path.join(config.installRoot, "runtime", "health-url.txt");
  let rawBase;

  try {
    rawBase = (await fsp.readFile(urlFile, "utf8")).trim();
  } catch (error) {
    return {
      observed_at: observedAt,
      available: false,
      endpoint_source: "runtime/health-url.txt",
      warnings: ["runtime health URL unavailable: " + String(error?.message || error)],
      telemetry: snapshotToolTelemetry({
        afterSeq,
        limit: telemetryLimit,
        includeEvents: includeTelemetryEvents,
      }),
    };
  }

  let base;
  try {
    base = validateLoopbackBase(rawBase);
  } catch (error) {
    return {
      observed_at: observedAt,
      available: false,
      endpoint_source: "runtime/health-url.txt",
      warnings: [String(error?.message || error)],
      telemetry: snapshotToolTelemetry({
        afterSeq,
        limit: telemetryLimit,
        includeEvents: includeTelemetryEvents,
      }),
    };
  }

  const baseText = base.toString().replace(/\/$/, "");
  const [healthz, readyz, mcpHealth, detailedHealth, metrics] = await Promise.all([
    fetchBounded(baseText + "/healthz", { maxBytes: 4096 }),
    fetchBounded(baseText + "/readyz", { maxBytes: 4096 }),
    fetchBounded(baseText + "/health/mcp", { maxBytes: 64000 }),
    fetchBounded(baseText + "/health?details=true", { maxBytes: 64000 }),
    fetchBounded(baseText + "/metrics", { maxBytes: 600000 }),
  ]);

  if (mcpHealth.status === 404) warnings.push("optional /health/mcp capability unavailable");
  if (detailedHealth.status === 404) warnings.push("optional detailed health capability unavailable");
  if (!metrics.ok) {
    warnings.push(
      "metrics unavailable" +
      (metrics.status ? " (HTTP " + metrics.status + ")" : "") +
      (metrics.error ? ": " + metrics.error : "")
    );
  }
  if (metrics.truncated) warnings.push("metrics response exceeded local bound and was truncated");

  const metricRows = metrics.ok ? parsePrometheus(metrics.body) : [];

  return {
    observed_at: observedAt,
    available: Boolean(metrics.ok),
    endpoint_source: "runtime/health-url.txt",
    endpoint: {
      protocol: base.protocol.replace(":", ""),
      host: base.hostname,
      port: base.port ? Number(base.port) : 80,
      loopback: true,
    },
    health: {
      liveness: healthEvidence(healthz),
      readiness: healthEvidence(readyz),
      mcp_component: healthEvidence(mcpHealth),
      detailed: healthEvidence(detailedHealth),
      metrics: healthEvidence(metrics),
    },
    tunnel_metrics: summarizeDeliveryMetrics(metricRows),
    telemetry: snapshotToolTelemetry({
      afterSeq,
      limit: telemetryLimit,
      includeEvents: includeTelemetryEvents,
    }),
    warnings,
    note:
      "Tunnel metrics are cumulative aggregates. This snapshot does not claim exact per-request causal correlation without a shared tunnel/request identifier. HTTP poll duration is long-poll lifetime, not direct network latency. The current delivery_snapshot handler may not yet appear in telemetry until it returns.",
  };
}

export function registerDeliverySnapshotTool(server, config) {
  server.tool(
    "delivery_snapshot",
    "Return one compact read-only correlation snapshot combining LConnect handler telemetry with local tunnel delivery/control-plane metrics. Reads only the runtime loopback health endpoint and omits tunnel IDs, credentials, arguments, request bodies and raw metrics.",
    {
      after_seq: z.number().int().min(0).optional(),
      telemetry_limit: z.number().int().min(1).max(500).optional(),
      include_telemetry_events: z.boolean().optional(),
    },
    async ({
      after_seq = 0,
      telemetry_limit = 50,
      include_telemetry_events = false,
    }) => {
      try {
        return textResult(await buildDeliverySnapshot(config, {
          afterSeq: after_seq,
          telemetryLimit: telemetry_limit,
          includeTelemetryEvents: include_telemetry_events,
        }));
      } catch (error) {
        return textResult({
          observed_at: new Date().toISOString(),
          available: false,
          warnings: [String(error?.message || error)],
        }, true);
      }
    }
  );
}
