# LCN 2026-09-24 — LCN-035 Turn-Safe Long Operation Observation

## Result

**PASS — TURN-SAFE LONG OPERATION OBSERVATION LIVE VALIDATED**

## Goal

Reduce exposure to user-visible ChatGPT `Message delivery timed out` during long-running local/GitHub work by shortening blocking observation calls and reducing response payloads.

This does not claim to modify or repair ChatGPT frontend/backend delivery behavior.

## Incident basis

The preceding live incident showed:

- a managed GitHub CI watcher continued after the assistant turn stopped issuing MCP calls
- the managed process later completed successfully
- LConnect handler telemetry remained healthy
- tunnel response traffic remained HTTP 200
- repeated ~10-second `wait_session` calls were present in the long turn

This localized the mitigation opportunity to turn length, blocking observation and repeated response delivery.

## Implementation

Implementation commit:

`ddab13a48a78e7ef217e153a6ba023cffd7ddd47`

Source catalog:

`111 → 112 tools`

Added:

- `session_status`

Changed:

- `list_sessions` is compact by default
- `list_sessions(include_output=true)` preserves explicit full-output access
- `wait_session` default wait: 1 second
- `wait_session` maximum wait: 3 seconds
- `wait_session` output tail disabled by default
- `github_run_wait` default wait: 1 second
- `github_run_wait` maximum wait: 3 seconds
- successful `gh auth status` readiness is cached in memory for 30 seconds
- `session_status` is available through `batch_inspect`

The GitHub readiness cache stores no token, no auth output and no persistent credential state. Failed authentication is not cached.

## Pre-deploy live baseline

Runtime before LCN-035 deployment: 111-tool installed daemon.

### list_sessions

One active managed full-suite session with buffered output:

- caller wall: 1333 ms
- LConnect handler: 0.072 ms
- result: 6813 chars

This demonstrates that session status could have almost zero local computation while still returning an unnecessarily large payload.

### github_run_view

Two sequential live calls for the same run:

First:

- caller wall: 5156 ms
- handler: 2470.330 ms
- result: 3828 chars

Second:

- caller wall: 4944 ms
- handler: 1933.388 ms
- result: 3828 chars

Both completed normally.

## New-source direct benchmark

A disposable direct stdio benchmark was run against the 112-tool source candidate.

The fixture produced approximately 6000 characters of managed-process stdout.

Results:

### Session observation

Compact `list_sessions`:

- wall: 1 ms
- result: 612 chars

Explicit full-output `list_sessions(include_output=true)`:

- wall: 1 ms
- result: 6648 chars

`session_status`:

- wall: 0 ms
- result: 609 chars

Default `wait_session` on a still-running process:

- wall: 1019 ms
- reported waited_ms: 1017 ms
- timed_out: true
- output_tail: null

Compared with the old live `list_sessions` sample, compact output reduced the observed response text from 6813 to 612 characters, approximately 91% for this representative fixture.

### GitHub auth readiness reuse

Direct source benchmark against real authenticated `gh`:

First `github_run_view`:

- wall: 1920 ms

Second call within auth TTL:

- wall: 1469 ms

These direct-source times must not be compared as end-to-end tunnel times with the live caller-wall numbers above. They demonstrate that the second local GitHub operation no longer needs a separate `gh auth status` process.

## Validation

Targeted:

- `session_status` compact/non-blocking: PASS
- `list_sessions` compact default: PASS
- explicit full-output compatibility: PASS
- `wait_session` 1s default: PASS
- `wait_session` >3s rejection: PASS
- GitHub readiness cache reuse: PASS
- `github_run_wait` 1s default: PASS
- `github_run_wait` >3s rejection: PASS
- unauthenticated/redaction behavior: PASS
- bounded batch regression: PASS

Local:

- `npm run check`: PASS
- full `npm test`: PASS
- full source smoke: `PASS tools=112`
- full-suite duration: approximately 43.9 seconds
- dependency audit: 0 vulnerabilities

The full test suite itself was run as a managed process. Observation used non-blocking `wait_session(timeout_seconds=0)` checks rather than a repeated long polling loop.

## CI

GitHub Actions run:

`35976569888`

Result:

`PASS`

Windows job, runtime smoke tests and dependency audit all completed successfully.

## Live post-deploy validation

Tracked files were synchronized to the installed runtime and the daemon was restarted.

Installed source smoke:

`PASS tools=112`

### Important catalog-refresh finding

The user intentionally restarted/reconnected LConnect **without refreshing the ChatGPT plugin UI**.

Observed ChatGPT-visible catalog:

- visible tools: 111
- direct `session_status`: not present in the ChatGPT schema

However, the restarted daemon was proven to be running the 112-tool code:

1. telemetry restarted at the new daemon start time
2. installed source smoke reported 112 tools
3. `batch_inspect` successfully invoked the new `session_status` operation even though ChatGPT did not expose it directly
4. `list_sessions` exhibited the new compact-default behavior

Catalog-cache proof sample:

- `session_status` invoked through `batch_inspect`: PASS
- inner handler: 0.164 ms
- compact `list_sessions` inner handler: 0.069 ms

Conclusion:

`daemon/runtime schema = 112 while ChatGPT-visible plugin schema remained 111 until plugin/catalog refresh`

Restarting LConnect alone does not necessarily refresh the ChatGPT-visible tool catalog.

### Live compact session observation

Representative live post-deploy `list_sessions` sample:

- caller wall: 1026 ms
- handler: 0.034 ms
- result: 602 chars

Pre-deploy baseline:

- caller wall: 1333 ms
- handler: 0.072 ms
- result: 6813 chars

For this representative buffered-output fixture, response text decreased by approximately 91.2%.

### Live session_status

Because the ChatGPT direct catalog remained stale, `session_status` was exercised through the read-only `batch_inspect` dispatcher.

The server executed the new operation successfully with sub-millisecond inner handler time.

This proves the runtime capability was active even though the direct ChatGPT schema was stale.

### Live wait_session default

A managed 10-second process was started and `wait_session` was called without an explicit timeout.

Observed:

- caller wall: 3264 ms
- handler: 1012.896 ms
- reported `waited_ms`: 1013 ms
- `timed_out`: true
- `output_tail`: null
- result size: 634 bytes

Therefore the new one-second default is active in the installed daemon.

Approximately 2.25 seconds of the caller wall remained outside the LConnect handler in this sample.

### Live GitHub observation

Two sequential post-deploy `github_run_view` calls:

First:

- caller wall: 4089 ms
- handler: 2104.568 ms

Second within readiness-cache TTL:

- caller wall: 3840 ms
- handler: 1472.070 ms

The second local handler avoided the repeated auth-readiness process and was approximately 632 ms lower in this sample.

The remaining multi-second caller overhead is still outside the local handler.

## Live acceptance result

- installed source catalog = 112: PASS
- new runtime behavior active: PASS
- `session_status` executable server-side: PASS
- compact `list_sessions`: PASS
- one-second default `wait_session`: PASS
- no default output tail: PASS
- GitHub readiness-cache behavior: PASS
- tool telemetry healthy: PASS
- ChatGPT-visible catalog automatically refreshed by daemon restart alone: **NO**

The final item is a plugin/catalog-discovery behavior, not an LCN-035 turn-safe observation failure.

## Architecture

LConnect still does not own workflow.

```text
AI decides whether/when to check
        ↓
LConnect returns short bounded observation
        ↓
long-running process continues independently
```

No autonomous polling, scheduler or background decision loop was added.
