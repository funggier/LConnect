# LCN-026 — Incremental Process Output Cursor

Status: **ACTIVE**

## Goal

เพิ่ม cursor/sequence-based incremental output สำหรับ managed process sessions

## Why

`read_process_output(clear=true/false)` เหมาะกับ basic workflow แต่ evidence-heavy long-running workต้องเลือกระหว่าง consume buffer หรืออ่านข้อมูลซ้ำ

Log Tail และ File Watcher มี cursor semantics ที่เหมาะกว่าอยู่แล้ว

## Planned capability

Primary tool:

- `read_process_events`

Optional helper only if justified:

- `process_session_status`

## Required behavior

- monotonic sequence numbers
- stdout/stderr stream identity preserved
- read after `after_seq`
- no duplicate event for same cursor
- bounded ring buffer
- explicit overflow metadata
- terminal exit status preserved
- timestamps/observation order structured
- old `read_process_output` remains compatible

## Architecture

Reuse design pattern from:

- `read_log_events`
- `watch_events`

Prefer extending shared session runtime instead of adding a separate process observation registry.

## Tests

- interleaved stdout/stderr
- repeated cursor reads
- no-repeat semantics
- buffer overflow
- large output
- process exit
- old API regression coverage

## Implementation progress

- Extended the existing managed process registry; no separate observation registry was created.
- Added `read_process_events`.
- Output events preserve `stdout` vs `stderr`.
- Lifecycle events include `exit`, `streams_closed` and launch errors.
- Sequence numbers are monotonic per process session.
- Reads use `after_seq` and return `next_cursor`, `has_more`, `earliest_available_seq` and explicit `overflowed` metadata.
- Event memory is bounded by the configured process buffer budget; old history is dropped with `dropped_through_seq` evidence.
- Existing `read_process_output` remains supported. Clearing its legacy stdout/stderr buffer does not clear cursor event history.
- Targeted tests passed for interleaved streams, no-repeat cursor reads, terminal exit, explicit overflow and exit-vs-pipe-close behavior.
- PowerShell syntax: PASS.
- `npm run check`: PASS.
- Full local `npm test`: PASS / catalog = 96 tools.
- `npm audit --audit-level=moderate`: 0 vulnerabilities.

## Acceptance criteria

- cursor semantics deterministic and documented
- memory bounded
- overflow never silent
- npm check/test/audit PASS
- direct MCP runtime acceptance PASS
- GitHub CI PASS
- docs/status/report updated

## Scope rule

Do not redesign log follower or filesystem watcher contracts unless a shared primitive can be extracted without changing their public semantics.
