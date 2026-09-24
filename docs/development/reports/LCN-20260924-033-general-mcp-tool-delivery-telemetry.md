# LCN 2026-09-24 — LCN-033 General MCP Tool Delivery Telemetry

## Result

**PASS — GENERAL MCP HANDLER TELEMETRY GREEN**

## Objective

Measure local LConnect execution for every tool call so caller-observed wall time can be compared with the actual handler time without assuming Message delivery timeout originates inside LConnect.

## Implementation

Added `modules/telemetry.mjs`.

Instrumentation is installed once at the MCP server tool-registration boundary. Existing capability handlers do not need telemetry-specific edits.

The telemetry wrapper records only bounded metadata:

- monotonic `seq`
- MCP SDK `request_id` when available
- `tool_name`
- `handler_started_at`
- `handler_completed_at`
- `handler_elapsed_ms`
- approximate `result_bytes`
- `is_error`
- `timed_out`
- `threw`

It does not record:

- tool arguments
- command text
- file contents
- environment values
- HTTP bodies
- result contents

## Storage

Default:

```json
{
  "telemetry": {
    "enabled": true,
    "maxEvents": 500
  }
}
```

Environment overrides:

- `LCONNECT_TELEMETRY_ENABLED`
- `LCONNECT_TELEMETRY_MAX_EVENTS`

Storage is an in-memory bounded ring. Overflow increments `dropped_events` explicitly.

No telemetry file upload or autonomous external delivery is added.

## Diagnostic tool

Added:

`tool_telemetry`

Actions:

- `snapshot`
- `clear`

Snapshot supports bounded filtering by sequence/tool and exposes aggregate timing/result-size summary plus recent events.

The telemetry diagnostic tool itself is excluded from instrumentation so reading telemetry does not contaminate the snapshot being read.

## Privacy regression

A fixture passed a unique secret-like marker as a tool argument to an intentionally failing call.

The marker was absent from telemetry output.

This proves the telemetry contract is metadata-only by construction rather than relying on post-hoc redaction of stored arguments.

## Validation

Implementation commit:

`8ebb95591b95443d28b77bcd812964c106650e34`

GitHub Actions:

`35958925520 — PASS`

Local:

- `npm run check`: PASS
- telemetry targeted smoke: PASS
- catalog: 97 tools
- full suite rerun: PASS
- audit: 0 vulnerabilities

A known local File Watcher timing flake occurred once in the first full-suite run. The isolated watcher suite passed immediately afterward, no watcher code changed in LCN-033, and the second full suite passed.

## Architectural boundary

LConnect remains:

- one tunnel
- one `main` MCP channel
- one MCP server
- a direct machine capability layer

Telemetry does not add planning, workflow execution, autonomous continuation, persistent task memory, or another agent runtime.

## Next live validation

After runtime restart with LCN-033 active:

1. clear telemetry
2. run representative fast/medium/managed-process tools
3. read one telemetry snapshot
4. compare handler elapsed against caller wall time
5. run a multi-tool sequence and estimate accumulated downstream delivery tail

Only after this measurement should round-trip-reduction capabilities be designed.
