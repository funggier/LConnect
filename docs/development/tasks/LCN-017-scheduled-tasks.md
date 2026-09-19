# LCN-017 — Scheduled Tasks

Status: **READY**

## Goal

จัดการ automation ที่อยู่ข้าม LConnect และ reboot

## Planned capabilities

list/get/create/run/stop/enable/disable/delete scheduled task

## Design notes

structured Task Scheduler wrapper; exact task identity for destructive action

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