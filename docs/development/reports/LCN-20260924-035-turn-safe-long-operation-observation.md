# LCN 2026-09-24 — LCN-035 Turn-Safe Long Operation Observation

## Result

**IMPLEMENTATION GREEN — LIVE DEPLOY VALIDATION PENDING**

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

## Deployment state

The currently connected installed daemon still runs the 111-tool pre-LCN-035 code.

The source candidate is 112 tools.

Tracked files must be synchronized to the installed runtime and LConnect restarted/reconnected before live post-deploy telemetry can be recorded.

## Expected live acceptance

After restart/reconnect:

- ChatGPT-visible catalog = 112
- `session_status` visible
- default `list_sessions` compact
- live `session_status` handler near-immediate
- live default `wait_session` bounded near 1 second
- sequential GitHub calls show reduced local handler cost from readiness-cache reuse
- tunnel/tool telemetry remains healthy

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
