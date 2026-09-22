# LCN 2026-09-22 — LCN-026 Incremental Process Output Cursor

## Result

**PASS — PROCESS CURSOR GREEN**

## Baseline

- Implementation commit: `9fcf3ea170dfed04d5233376505102a6501d606b`
- GitHub Actions run: `35754500025` — PASS

## Added tool

- `read_process_events`

## Event model

Managed process sessions now record bounded events with monotonic sequence numbers.

Event types include:

- `output` with explicit `stream: stdout|stderr`
- `exit`
- `streams_closed`
- `launch_error`

Reads use:

- `after_seq`
- `max_events`

And return:

- `next_cursor`
- `has_more`
- `overflowed`
- `earliest_available_seq`
- session terminal metadata

## Compatibility

`read_process_output` remains supported.

Clearing the legacy stdout/stderr buffer does not clear cursor event history.

## Bounded-memory behavior

Event history uses the configured process buffer budget.

When old events are evicted:

- `dropped_through_seq` advances
- readers behind that point receive `overflowed: true`
- history loss is therefore never silent

## Acceptance

Local and Windows CI:

- interleaved stdout/stderr identity: PASS
- monotonic sequence: PASS
- no-repeat cursor reads: PASS
- exit event: PASS
- explicit overflow: PASS
- large output: PASS
- legacy API regression: PASS
- exit-vs-pipe-close evidence: PASS
- catalog: 96 tools
- dependency audit: 0 vulnerabilities

## Next

`LCN-027 — Structured Text Search` is READY but was not started in this task pair.
