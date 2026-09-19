# LCN-009 — Windows Services

Status: **READY**

## Goal

ควบคุม persistent Windows runtimes โดยไม่พึ่ง raw PowerShell

## Planned capabilities

list_services, get_service, start_service, stop_service, restart_service, set_service_startup

## Design notes

ใช้ native service APIs; preserve permission/SCM errors

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