# LCN-039 — Local Delivery Phase Localization

Status: **COMPLETE — EVIDENCE BOUNDARY ESTABLISHED**

## Goal

Determine how much of normal tool-call wall time is attributable to:

1. LConnect handler execution
2. local tunnel poll-to-response processing
3. local response POST
4. time outside the measurable local path

The purpose is to avoid speculative timeout tuning after LCN-031–038.

## Method

A temporary local sampler observed the active tunnel-client `/metrics` endpoint approximately every 50 ms while three low-cost `system_info` calls were executed sequentially.

The sampler recorded only aggregate counters/timing transitions:

- control-plane commands enqueued/polled
- tools/call poll-to-response count/sum
- response POST count/sum

LConnect `tool_telemetry` independently recorded handler timestamps/durations.

Caller wall time was measured around each tool call.

The temporary sampler and fixtures were deleted after the experiment.

## Controlled sample

| Sample | Caller wall | Handler | Tunnel poll→response | Response POST | Caller − poll→response |
|---|---:|---:|---:|---:|---:|
| 1 | 1054 ms | 0.370 ms | 291 ms | 286.629 ms | 763 ms |
| 2 | 1094 ms | 0.529 ms | 290 ms | 279.267 ms | 804 ms |
| 3 | 1347 ms | 0.362 ms | 319 ms | 316.003 ms | 1028 ms |

Averages:

- caller wall: 1165 ms
- handler: 0.420 ms
- local tunnel poll→response: 300 ms
- response POST: 293.967 ms
- caller wall outside local poll→response scope: 865 ms

## Interpretation

For this low-cost read-only tool class:

- LConnect handler execution is negligible
- almost all measured local poll→response time is the response POST itself
- there is no evidence of handler CPU pressure as the dominant source
- substantial wall time remains outside the local tunnel poll→response metric scope

That residual can include time before the local tunnel receives/polls the command and/or time after local response posting before the remote caller receives the result.

The local evidence cannot split those two external segments.

## Dispatcher log caveat

The tunnel log message:

`dispatcher forwarded command to MCP server`

cannot be used as an exact dispatch-start timestamp.

In the controlled samples its log timestamp appeared roughly 280–316 ms after the corresponding LConnect handler start.

Therefore the log line is useful as lifecycle evidence but not as a precise pre-handler timing boundary.

## Local ownership conclusion

The following local mitigations are already implemented and evidence-backed:

- bounded synchronous request budget
- managed long-running sessions
- short/non-blocking session observation
- compact session status output
- bounded read-only batching
- handler telemetry
- GitHub auth readiness cache
- GitHub status-fetch / wait-budget separation
- runtime catalog diagnostics
- structured delivery correlation snapshot
- reduced long polling inside one assistant turn

The remaining normal-call residual measured here is not attributable to LConnect handler execution or queue pressure.

Increasing local synchronous timeouts is not supported by the evidence and can increase exposure to long assistant turns.

## Operational rule

Prefer:

- fewer MCP round trips
- compact outputs
- `batch_inspect` for independent read-only observations
- managed processes for long work
- non-blocking status checks
- checkpoint before external waits

Do not treat a ChatGPT `Message delivery timed out` UI event as proof that the local process/tool failed.

## Reopen criteria

Reopen delivery-latency implementation only when at least one of these is available:

- a new reproducible timeout with fresh LConnect/tunnel evidence
- a tunnel-client version exposing a shared per-request trace/timestamp for response completion
- reliable upstream/client-side timing correlated to the same request
- evidence that a local queue/handler/response phase regressed materially

Otherwise continue execution ergonomics rather than speculative timeout tuning.
