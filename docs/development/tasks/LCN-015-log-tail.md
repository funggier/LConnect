# LCN-015 — Log Tail

Status: **READY**

## Goal

อ่านเฉพาะ log ใหม่แบบ incremental

## Planned capabilities

tail_file, follow_log, read_log_events, search_log, stop_log_follow

## Design notes

session IDs + bounded buffers/cursors; handle rotation/truncate

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