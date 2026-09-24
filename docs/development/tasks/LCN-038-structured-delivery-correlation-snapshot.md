# LCN-038 — Structured Delivery Correlation Snapshot

Status: **ACTIVE — IMPLEMENTATION GREEN / INSTALLED LIVE VALIDATION PENDING**

## Goal

Provide one compact read-only diagnostic that correlates local LConnect handler timing with the tunnel-client delivery/control-plane evidence already exposed on the local health endpoint.

This reduces repeated manual HTTP/telemetry calls while preserving the boundary that LConnect does not own ChatGPT message delivery.

## Evidence basis

LCN-033/035/037 repeatedly show material caller wall time outside LConnect handlers.

Current runtime health capabilities:

- runtime endpoint source: `runtime/health-url.txt`
- `/healthz`: available
- `/readyz`: available
- `/metrics`: available
- `/health/mcp`: optional / currently 404
- `/health?details=true`: optional / currently 404

Tunnel metrics include:

- `command_end_to_end_latency_milliseconds`
- `commands_enqueued_total`
- `commands_polled_total`
- `commands_poll_cycles_total`
- `commands_queue_length`
- `dispatcher_worker_pool_capacity`
- `dispatcher_worker_pool_occupancy`
- `http_client_request_duration_seconds`

## Tool

Add read-only:

`delivery_snapshot`

### Endpoint discovery

Read the active runtime endpoint from:

`<installRoot>/runtime/health-url.txt`

Do not hardcode port 18020.

Only loopback HTTP endpoints are accepted:

- 127.0.0.1
- localhost
- ::1

### Output

Compact structured evidence:

- observed_at
- runtime endpoint availability (without credentials)
- healthz status
- readyz status
- optional detailed-health capability state
- local tool telemetry summary/cursor
- tools/call enqueue_to_response count/sum/average
- tools/call poll_to_response count/sum/average
- server/discover count/sum/average
- response POST count/sum/average
- poll GET count/sum/average
- queue length
- worker occupancy/capacity
- command enqueue/poll counters
- warnings/capability gaps

Do not return raw Prometheus text.

Do not return tunnel IDs, credentials, request bodies, tool arguments or user content.

## Correlation semantics

This is a snapshot of cumulative metrics plus bounded local telemetry.

It does not claim per-request causal correlation where the tunnel metrics do not expose an exact shared request identifier.

The current `delivery_snapshot` call itself may not yet be present in handler telemetry because the handler has not returned.

## Stale-client recovery

Add `delivery_snapshot` to the read-only `batch_inspect` allowlist so an older client catalog can still invoke it through the existing batch tool after a daemon restart.

## Non-goals

- modifying tunnel-client
- changing ChatGPT/OpenAI delivery timeouts
- autonomous monitoring
- background polling
- inferring an exact platform-side root cause from aggregate metrics

## Current evidence

- implementation: `ff12ecb2f167a319a117a27387c81efc71fd7356`
- source catalog: 114 tools
- targeted delivery/batch/source smoke: PASS
- live source-candidate parser validation: PASS
- full local suite: PASS (`PASS tools=114`, approximately 44.8 seconds)
- dependency audit: 0 vulnerabilities
- GitHub Actions: `35982810098` — PASS
- installed live validation: PENDING

## Acceptance

- endpoint comes from runtime URL file, not hardcoded port
- non-loopback endpoint rejected
- health endpoints bounded and optional
- Prometheus parser returns only allowlisted aggregates
- tunnel IDs/raw labels omitted
- telemetry correlation metadata included
- optional endpoint 404 does not fail snapshot
- batch_inspect visibility works
- targeted/full tests PASS
- audit PASS
- CI PASS
- live installed snapshot recorded
