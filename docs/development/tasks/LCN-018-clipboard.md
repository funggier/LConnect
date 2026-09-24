# LCN-018 — Clipboard

Status: **DEFERRED**

## Goal

เพิ่ม desktop bridge ขนาดเล็กที่มีประโยชน์สูง

## Planned capabilities

clipboard_get, clipboard_set, clipboard_clear

## Design notes

เริ่ม text clipboard; Unicode roundtrip

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