# LCN 2026-09-23 — LCN-032 HTTP Hard-Settle Timeout + Delivery Evidence

## Result

**PASS — HTTP LOCAL DEADLINE HARDENED**

## Trigger

After LCN-031 was activated through the live ChatGPT Tunnel connector, a delayed-body HTTP fixture produced this evidence:

- Node AbortController direct: approximately 1002 ms for a 1000 ms deadline
- LConnect direct stdio MCP: approximately 1019 ms
- live ChatGPT/Tunnel receipt: approximately 5000 ms

The LConnect result already reported `ETIMEDOUT` at 1000 ms, but the live caller observed the result several seconds later.

## Root boundary

Direct stdio testing proves the HTTP handler itself can complete at the requested deadline.

The additional live delay occurs after the LConnect-local MCP result has completed.

Current tunnel-client v0.0.14 info logs show command forwarding to the MCP server but do not expose enough terminal-response-post timing to attribute the remaining delivery tail more precisely from LConnect alone.

## Fix

`modules/http.mjs` now uses a hard outer deadline race.

When the deadline expires:

1. AbortController is triggered.
2. The MCP-facing promise rejects immediately with `ETIMEDOUT`.
3. LConnect does not wait for fetch/body consumer cancellation propagation.
4. Any later underlying rejection is already handled.
5. Download cleanup remains active.

HTTP success/error results now expose safe local timing evidence:

- `timeout_requested_ms`
- `timeout_effective_ms`
- `timeout_capped`
- `handler_elapsed_ms`
- `deadline_elapsed_ms`
- `completed_at`

This makes future local-vs-delivery latency directly distinguishable.

## Regression strengthening

The delayed-body fixture remains 3 seconds while the effective request budget is 1 second.

The acceptance threshold was tightened below the full body delay and now validates the structured local timing evidence.

A test can no longer pass merely because the timeout message is correct while the handler actually waits for the delayed body.

## Validation

Implementation commit:

`06a246be0ac41855344504288ab64e7a7f5e2a0c`

GitHub Actions:

`35888912101 — PASS`

Local:

- `npm run check`: PASS
- strict timeout containment smoke: PASS
- HTTP smoke: PASS
- full `npm test`: PASS / 96 tools
- dependency audit: 0 vulnerabilities

## Upstream check

At implementation time, OpenAI tunnel-client v0.0.14 remains the latest published release. No newer stable binary was available to replace the current runtime.

The tunnel protocol documents a response timeout covering the complete command lifecycle, including response delivery. The remaining live delivery tail is therefore treated as external to LConnect core unless newer tunnel/control-plane evidence proves otherwise.

## Boundary

No new MCP channel, workflow engine, autonomous continuation or orchestration behavior was introduced.

LCN-027 remains READY and was not started.

## Live post-restart validation

After restarting/reconnecting LConnect with LCN-032 active, live connector testing produced:

### Delayed-body timeout fixture

Three `http_request` calls used a 1000 ms timeout against a local server that sent headers immediately and delayed the body for 5000 ms.

| Run | LConnect handler elapsed | Caller-observed wall time | Observed post-handler tail |
|---|---:|---:|---:|
| 1 | 1028 ms | 3449 ms | 2421 ms |
| 2 | 1006 ms | 5251 ms | 4245 ms |
| 3 | 1001 ms | 3735 ms | 2734 ms |

Average:

- LConnect handler: approximately 1012 ms
- caller wall time: approximately 4145 ms
- post-handler tail: approximately 3133 ms

All timeout results returned `ETIMEDOUT` with correct local timing evidence.

### Fast success-path fixture

A local tunnel-client health HTTP request completed inside LConnect in:

`handler_elapsed_ms = 2`

Caller-observed wall time was approximately:

`4635 ms`

This proves the multi-second live tail is not specific to delayed HTTP-body cancellation.

### Non-HTTP live tool observations

Observed caller wall times:

- `list_sessions`: approximately 640 ms
- `system_info`: approximately 2717 ms
- `refresh_state`: approximately 3280 ms

The tail is therefore variable and transport/tool-delivery-wide rather than an HTTP-only execution defect.

### tunnel-client metrics

At the time of testing, local tunnel-client `/metrics` reported:

- tools/call `poll_to_response`: 7569 ms / 14 = approximately 541 ms average
- tools/call `enqueue_to_response`: 2291 ms / 4 = approximately 573 ms average
- control-plane `POST /response`: 5.5308873 s / 19 = approximately 291 ms average

These metrics indicate the local tunnel-client path typically posts terminal responses substantially faster than the worst caller-observed wall times.

### Conclusion

LCN-032 is active and working as designed.

The remaining variable multi-second latency is after the LConnect-local handler boundary and is not explained by LConnect HTTP execution. Current evidence also does not indicate that tunnel-client response POST latency alone accounts for the full observed tail.

The remaining tail should therefore be treated as downstream connector/control-plane/tool-delivery scheduling latency unless future instrumentation provides a more specific attribution.

All temporary live-test process sessions were terminated/released and `refresh_state` confirmed no remaining process/log/watcher handles.
