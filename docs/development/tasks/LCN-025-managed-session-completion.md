# LCN-025 — Managed Session Completion

Status: **READY**

## Goal

เพิ่ม `wait_session` เพื่อให้ agent รอ managed process session แบบ bounded ได้โดยไม่ต้องประกอบ sleep/poll loop ซ้ำเอง

## Why

`start_process` แก้ปัญหา long-running operation ได้ดีแล้ว แต่ terminal completion ยังต้อง poll ด้วยหลาย MCP calls

งานจริงที่กินเวลาหลายนาทีแสดงว่ารูปแบบนี้เพิ่ม orchestration overhead และเพิ่มโอกาส upstream UI/tool timeout โดยไม่เพิ่มความถูกต้องของ local process

## Planned capability

Primary tool:

- `wait_session`

## Required behavior

- bounded wait per call
- timeout does not terminate child
- repeated waits allowed
- terminal result idempotent
- exact exit code/signal preserved
- optional bounded stdout/stderr tail
- unknown/expired session diagnostic clear
- compatible with stdin and current session registry
- `read_process_output` remains supported

## Suggested schema

Inputs:

- `session_id`
- `timeout_seconds`
- `poll_interval_ms`
- `include_output_tail`
- `output_tail_chars`

Outputs:

- running/completed/timed_out
- exit_code/signal
- elapsed time
- bounded stdout/stderr tail

## Tests

- exit 0
- exit nonzero
- timeout while process remains alive
- subsequent wait observes completion
- repeated terminal query
- stdin process compatibility
- session cleanup/unknown session behavior

## Acceptance criteria

- implementation reuses managed session registry
- no duplicate process lifecycle model
- npm check/test/audit PASS
- existing process/development tools do not regress
- direct MCP runtime acceptance PASS
- GitHub CI PASS
- docs/status/report updated

## Scope rule

Do not add process output cursor semantics here except minimum internal work needed for `wait_session`; cursor work belongs to LCN-026.
