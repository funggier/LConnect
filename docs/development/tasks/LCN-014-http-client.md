# LCN-014 — HTTP Client

Status: **READY**

## Goal

ทดสอบ API/health/local dashboards โดยไม่เปิด browser

## Planned capabilities

http_request, http_probe, http_headers, http_download

## Design notes

bounded body; explicit timeout/redirect; downloads to file

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