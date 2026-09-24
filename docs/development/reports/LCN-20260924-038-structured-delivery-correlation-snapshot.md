# LCN 2026-09-24 — LCN-038 Structured Delivery Correlation Snapshot

## Result

**IMPLEMENTATION GREEN — INSTALLED LIVE VALIDATION PENDING**

## Goal

Provide one compact read-only snapshot that combines:

- LConnect handler telemetry
- active tunnel health endpoint evidence
- tunnel dispatcher/control-plane metrics

The purpose is to reduce repeated manual diagnostic calls and make the remaining non-handler latency easier to localize without claiming visibility into internal ChatGPT frontend/backend components.

## Evidence basis

Prior live measurements repeatedly showed material caller wall time outside LConnect handlers.

Most recently, LCN-037 live validation observed:

- caller wall: 4123 ms
- local handler: 1525.596 ms
- approximately 2597 ms outside the handler

The tunnel-client already exposes useful local cumulative metrics, but they previously required separate HTTP calls and manual parsing.

## Tool

Added:

`delivery_snapshot`

Source catalog:

`113 → 114 tools`

## Endpoint discovery

The tool reads the active endpoint from:

`<installRoot>/runtime/health-url.txt`

It does not hardcode port 18020.

Only loopback HTTP endpoints are accepted:

- 127.0.0.1
- localhost
- ::1

A non-loopback endpoint is rejected before any HTTP request is made.

## Health capability model

Current live tunnel-client capabilities observed during implementation:

- `/healthz`: 200
- `/readyz`: 200
- `/metrics`: 200
- `/health/mcp`: 404
- `/health?details=true`: 404

Optional 404 capabilities are reported as unavailable and do not fail the snapshot.

## Metric contract

Only selected aggregate evidence is returned.

### tools/call dispatcher latency

From:

`command_end_to_end_latency_milliseconds`

Returned separately for:

- `enqueue_to_response`
- `poll_to_response`

Each includes:

- count
- cumulative sum
- average

### discovery

`server/discover poll_to_response`

This helps determine whether a client/plugin refresh actually caused a new server discovery request.

### HTTP control-plane transport

From:

`http_client_request_duration_seconds`

Returned as:

- response POST duration
- poll GET long-poll duration

Important:

HTTP poll duration is the lifetime of a long-poll request. It must not be interpreted as direct network latency.

### queue/worker/control-plane state

- commands queue length
- dispatcher worker pool capacity
- dispatcher worker pool occupancy
- commands enqueued total
- commands polled total
- poll cycles total

## Privacy / evidence boundary

The snapshot does not return:

- tunnel IDs
- raw Prometheus labels
- raw metrics text
- credentials
- request bodies
- tool arguments
- user file contents

It returns only allowlisted aggregates.

## Bounded HTTP implementation

Health/metrics bodies are read through a streaming byte bound.

The implementation does not call `arrayBuffer()` for the entire response and truncate afterward.

If the metrics response exceeds the local 600 KB bound:

- reading stops
- the stream is cancelled
- `truncated` evidence is reported through warnings

## Telemetry correlation

The tool embeds a bounded `tool_telemetry` snapshot with:

- telemetry cursor
- summary
- optional metadata-only events

The current `delivery_snapshot` invocation may not yet appear in telemetry because its handler has not returned.

Tunnel metrics are cumulative and do not currently expose an exact shared per-request identifier with LConnect telemetry. Therefore the tool does not claim exact causal per-request correlation.

## Stale-client recovery

`delivery_snapshot` is allowlisted in `batch_inspect`.

After a daemon restart, an older ChatGPT-visible catalog can still invoke the new diagnostic through the existing batch tool even before direct schema rediscovery.

## Targeted validation

- syntax check: PASS
- runtime URL discovery: PASS
- loopback guard: PASS
- health capability detection: PASS
- latency aggregation: PASS
- queue/control-plane aggregation: PASS
- tunnel-label omission: PASS
- streaming >600 KB metrics bound: PASS
- registered direct tool: PASS
- `batch_inspect → delivery_snapshot`: PASS
- source smoke: `PASS tools=114`
- dependency audit: 0 vulnerabilities

## Live source-candidate parser validation

The source candidate was executed directly against the real installed tunnel health endpoint.

Observed:

- endpoint: loopback HTTP on the active runtime port
- liveness/readiness: PASS
- optional MCP/detailed health: unavailable (404), handled safely
- metrics: available

Representative cumulative metrics at observation time:

### tools/call

- enqueue_to_response: count 1, sum 798 ms, average 798 ms
- poll_to_response: count 40, sum 23490 ms, average 587.25 ms

### HTTP

- response POST: count 40, sum 11616.053 ms, average 290.401 ms
- poll GET long-poll duration: count 46, average 11686.887 ms

### dispatcher/control plane

- queue length: 0
- worker capacity: 10
- worker occupancy: 1
- commands enqueued: 41
- commands polled: 41
- poll cycles: 47

These values are cumulative snapshot evidence only.

## Full validation

Full local suite: **PASS** (`PASS tools=114`, approximately 44.8 seconds)

GitHub Actions: **PASS** — run `35982810098`

Installed live validation: **PENDING**
