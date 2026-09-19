# LCN-015 — Log Tail

Status: **COMPLETE**

## Goal

อ่านเฉพาะ log ใหม่แบบ incremental

## Planned capabilities

tail_file, follow_log, read_log_events, search_log, stop_log_follow

## Design notes

session IDs + bounded buffers/cursors; handle rotation/truncate

## Progress

- 2026-09-19: Started from coordination HEAD `2ab5f61b4f2231a908ae0e185d3424feaaf03f2b`.
- RED established: smoke catalog expected five Log Tail tools and failed because implementation was absent.
- Added `modules/log-tail.mjs` and `tests/log-tail-smoke.mjs`.
- Followers use background bounded polling and return a follower ID immediately.
- Event consumption uses sequence cursors; no MCP call waits for new log data.
- Append, truncate and file replacement/rotation are distinct events.
- Event buffers and per-poll reads are bounded.
- Disposable log acceptance PASS: tail, append, truncate, rotation, cursor stability, regex search, stop cleanup.
- Local catalog: 79 tools.
- `npm run check`: PASS.
- `npm test`: PASS.
- `npm audit --audit-level=moderate`: 0 vulnerabilities.

## Completion evidence

- Implementation commit: `ab44fe8cfe9065d23dd79f9d49d0e93f280695f6`
- GitHub Actions run: `35451399444` — PASS
- Windows CI runtime smoke: catalog = 79 tools
- append/truncate/rotate/cursor/search/cleanup fixture suite: PASS
- dependency audit: 0 vulnerabilities

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