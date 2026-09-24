# LCN-033 — General MCP Tool Delivery Telemetry

Status: **COMPLETE**

## Goal

Measure local execution timing for every LConnect tool call with minimal overhead so live ChatGPT/Tunnel wall time can be compared against LConnect handler time.

## Trigger

LCN-031/032 reduced LConnect-originated stalls, but users still observe `Message delivery timed out` after tool-heavy turns. Live evidence shows individual LConnect handlers can complete much faster than caller-observed wall time.

## Design

Instrument tool registration once at the MCP server boundary instead of editing every tool handler.

Record only bounded metadata:

- monotonic telemetry sequence
- MCP request ID when available
- tool name
- handler start timestamp
- handler completion timestamp
- handler elapsed milliseconds
- approximate result bytes
- success/error
- timeout-like result flag

Do **not** record:

- tool arguments
- command text
- file contents
- environment values
- HTTP bodies
- secrets

## Storage

- bounded in-memory ring buffer
- default enabled
- bounded event count
- no persistent JSONL file by default
- no autonomous upload

## Inspection

Add one diagnostic tool:

`tool_telemetry`

Actions:

- `snapshot`
- `clear`

Snapshot provides:

- aggregate counts/latency per tool
- recent bounded events
- dropped-event count
- server telemetry start time

## Boundary

- one MCP channel remains
- no workflow engine
- no autonomous task manager
- no additional agent layer
- telemetry must not materially increase tool latency

## Implementation progress

- Instrumented MCP tool registration once through `modules/telemetry.mjs`; existing tool handlers were not rewritten.
- Added bounded in-memory telemetry ring.
- Added metadata-only `tool_telemetry` diagnostic tool.
- Captures SDK `requestId`, tool name, handler timestamps/elapsed time, approximate result bytes, error and timeout-like state.
- Explicitly does not record arguments, command text, file contents, environment values, HTTP bodies or result contents.
- Added config:
  - `telemetry.enabled` default `true`
  - `telemetry.maxEvents` default `500`
  - `LCONNECT_TELEMETRY_ENABLED`
  - `LCONNECT_TELEMETRY_MAX_EVENTS`
- Catalog increased from 96 to 97 tools.
- Targeted telemetry smoke: PASS.
- Privacy marker regression: PASS.
- Bounded overflow/clear: PASS.
- First full suite exposed the known local File Watcher timing flake; isolated watcher rerun passed and no watcher code changed.
- Second full suite: PASS / 97 tools.
- Dependency audit: 0 vulnerabilities.

## Completion evidence

- Implementation commit: `8ebb95591b95443d28b77bcd812964c106650e34`
- GitHub Actions run: `35958925520` — PASS
- Current candidate catalog: 97 tools
- Targeted telemetry tests: PASS
- Metadata privacy regression: PASS
- Bounded overflow/clear: PASS
- Full local suite rerun: PASS
- Dependency audit: 0 vulnerabilities
- Known File Watcher local timing flake reproduced once; isolated watcher rerun and full rerun passed, with no watcher code changes in LCN-033.

## Acceptance

- fast tool records request/tool/timing/result-size evidence
- error tool records error state without recording arguments
- bounded ring overflow is explicit
- telemetry tool can snapshot and clear
- full 97-tool catalog passes
- full test suite + audit PASS
- live validation compares handler time with caller wall time
- GitHub CI PASS
