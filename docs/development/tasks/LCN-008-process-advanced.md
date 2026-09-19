# LCN-008 — Process Advanced

Status: **READY**

## Goal

ยกระดับ PID/session tools เป็น structured lifecycle control

## Planned capabilities

process_details, process_tree, find_process, wait_process, restart_process

## Design notes

PID identity check; parent/child tree; wait แบบไม่แขวน RPC

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