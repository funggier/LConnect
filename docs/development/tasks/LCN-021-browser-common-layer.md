# LCN-021 — Browser Common Layer

Status: **PLANNED**

## Goal

สร้าง browser session API กลางเหนือ backend adapters

## Planned capabilities

browser_start/attach/stop/tabs/navigate/snapshot/click/type/screenshot

## Design notes

session registry; capability negotiation; no Edge dependency

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