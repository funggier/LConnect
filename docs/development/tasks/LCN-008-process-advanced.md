# LCN-008 — Process Advanced

Status: **ACTIVE**

## Goal

ยกระดับ PID/session tools เป็น structured lifecycle control

## Planned capabilities

process_details, process_tree, find_process, wait_process, restart_process

## Design notes

PID identity check; parent/child tree; wait แบบไม่แขวน RPC

## Progress

- 2026-09-19: Started from coordination HEAD `d8a695e5df98cec7b7a766a9050f80d216ea4a8c`.
- RED established: smoke catalog expected five new tools and failed because implementation was absent.
- Safety invariant: operations that wait for or restart an arbitrary PID use OS process creation time as identity evidence to detect PID reuse.
- `restart_process` requires explicit relaunch program/arguments rather than guessing/parsing the original Windows command line.
- Bounded wait design: `wait_process` max is 30 seconds per call and can be repeated.
- Added `modules/process-advanced.mjs`.
- Added `tests/process-advanced-smoke.mjs` using disposable Node fixture processes only.
- Local GREEN: catalog = 35 tools.
- `process_details` identity: PASS.
- `find_process` PID and command-line filters: PASS.
- `process_tree` real parent/child fixture: PASS.
- `wait_process` bounded timeout: PASS.
- `wait_process` PID-reuse guard: PASS.
- `wait_process` natural exit: PASS.
- `restart_process` PID-reuse guard: PASS.
- `restart_process` explicit relaunch: PASS.
- `npm audit --audit-level=moderate`: 0 vulnerabilities.

## Acceptance criteria

- capability ถูก register ผ่าน MCP และมี structured schema
- output bounded และ error preserve root cause
- tests ครอบคลุม happy path + failure path ที่สำคัญ
- existing tools ไม่ regression
- documentation อัปเดต
- npm check/test/audit และ GitHub CI PASS
- บันทึก exact commit SHA, changed files, runtime evidence และ follow-up tasks ตอนปิดงาน

## Scope rule

ถ้าพบ adjacent work ที่แยกได้ ให้สร้าง numbered task ใหม่แทนการขยาย task นี้ไม่สิ้นสุด