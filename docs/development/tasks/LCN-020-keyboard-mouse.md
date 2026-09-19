# LCN-020 — Keyboard / Mouse

Status: **PLANNED**

## Goal

fallback/control layer สำหรับ native UI

## Planned capabilities

key_press, key_combo, type_text, mouse_move, mouse_click, mouse_scroll

## Design notes

ไม่ใช้เป็น browser DOM strategy หลัก; report context/coordinates

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