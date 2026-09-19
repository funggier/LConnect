# LCN-016 — File Watcher

Status: **ACTIVE**

## Goal

รอ filesystem changes แบบ event-driven

## Planned capabilities

watch_path, watch_events, watch_status, stop_watch

## Design notes

ไม่ hold MCP call; explicit overflow/coalescing semantics

## Progress

- 2026-09-19: Started from coordination HEAD `24a6571d31c3a1f20dbed6b37be71af7748306f3`.
- RED established: smoke catalog expected four File Watcher tools and failed because implementation was absent.
- Added `modules/file-watcher.mjs` and `tests/file-watcher-smoke.mjs`.
- Watchers return immediately with a watcher ID; event reads use sequence cursors.
- Event buffers are bounded and report overflow.
- `fs.watch` events are treated as OS notifications that may be coalesced; they are not presented as a lossless audit log.
- Recursive capability is requested explicitly and platform errors remain visible.
- Disposable directory acceptance PASS: create/change, recursive nested file, rename/delete, cursor stability and cleanup.
- Local catalog: 83 tools.
- `npm run check`: PASS.
- `npm test`: PASS.
- `npm audit --audit-level=moderate`: 0 vulnerabilities.
- First GitHub CI run `35451668817` exposed a Node/libuv Windows crash when using native `fs.watch(..., { recursive: true })`: assertion failure in `src\\win\\fs-event.c`.
- Replaced native recursive mode with one non-recursive watcher handle per directory plus bounded directory-tree refresh on rename/create/delete notifications.
- The revised design avoids the libuv recursive-watch crash class and keeps the same cursor/buffer contract.

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