# LCN 2026-09-24 — LCN-039 Local Delivery Phase Localization

## Result

**PASS — LOCAL LATENCY BOUNDARY ESTABLISHED**

## Why this task exists

LCN-031–038 progressively removed or measured the local causes that LConnect can control:

- handler timeout containment
- HTTP hard-settle evidence
- metadata-only tool telemetry
- bounded batch inspection
- turn-safe process observation
- runtime catalog visibility
- GitHub wait-budget repair
- structured delivery/tunnel snapshot

The remaining question was whether the persistent ~1–2+ second caller overhead could still be localized to a specific local stage.

## Experimental design

A disposable Node sampler ran on the user machine for five seconds.

It sampled the active tunnel-client `/metrics` endpoint about every 50 ms.

During the sample, three sequential `system_info` tool calls were issued.

This tool was chosen because its handler is deterministic, read-only, small-output and sub-millisecond to low-millisecond, making transport overhead dominant.

The sampler observed metric transitions only; it did not capture arguments, result content, credentials or tunnel IDs.

LConnect telemetry was cleared immediately before the experiment.

## Raw local handler evidence

Three `system_info` handlers:

- 0.370 ms
- 0.529 ms
- 0.362 ms

Average:

`0.420 ms`

Caller wall:

- 1054 ms
- 1094 ms
- 1347 ms

Average:

`1165 ms`

## Tunnel metric deltas

For the same three responses, the cumulative tools/call `poll_to_response` histogram advanced by:

- 291 ms
- 290 ms
- 319 ms

Average:

`300 ms`

The response POST HTTP-duration histogram advanced by:

- 286.629 ms
- 279.267 ms
- 316.003 ms

Average:

`293.967 ms`

Thus nearly all measured local poll-to-response duration for these near-zero handlers was the control-plane response POST.

## Residual outside local poll-to-response scope

Caller wall minus local poll-to-response:

- 763 ms
- 804 ms
- 1028 ms

Average:

`865 ms`

This residual is outside the tunnel-client metric phase measured from local command poll through response posting.

It can include:

1. upstream scheduling/delivery before the local tunnel receives the command
2. downstream processing after the local response POST succeeds

The available local evidence cannot split these two external segments.

## Response-counter timing

The sampler observed each response counter increment roughly 299–330 ms after the corresponding LConnect handler completion.

Those intervals closely matched the independent HTTP response POST durations above.

This cross-check increases confidence that the local post-handler phase is approximately 0.3 seconds in this test class rather than ~1 second.

## Dispatcher log limitation

The current tunnel-client info log emits:

`dispatcher forwarded command to MCP server`

with request metadata.

However, in the controlled samples the log timestamp appeared approximately 280–316 ms after the LConnect handler-start timestamp.

Therefore this log timestamp is not safe as an exact command-forward boundary.

No matching response-completion info log was exposed at the current log level.

## Relationship to Message delivery timed out

This task does not claim that a normal ~865 ms external residual directly causes the earlier user-visible timeout.

The earlier incident involved a long assistant turn and repeated long observation calls.

What this experiment establishes is narrower:

- the normal local handler is not the dominant delay
- the local tunnel response-post phase is measurable and modest in these samples
- a material portion of wall time exists outside LConnect's local execution/delivery scope
- speculative increases to LConnect handler timeout are therefore not justified

## Local mitigation status

Within LConnect ownership, the useful latency/timeout mitigations are now implemented:

- fewer round trips via bounded batch reads
- compact/default-minimal session outputs
- managed work instead of synchronous long operations
- short/non-blocking wait contracts
- explicit GitHub status-fetch budget
- bounded output and telemetry
- structured tunnel correlation snapshot

The project should not keep adding local timeout layers merely to chase platform-side residual latency.

## Decision

**Delivery-latency local mitigation work is complete at the current evidence boundary.**

Reopen only with new evidence or a new instrumentation primitive that provides a shared request trace across local tunnel and upstream caller.

Execution ergonomics can continue independently.
