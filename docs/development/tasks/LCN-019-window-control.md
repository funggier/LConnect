# LCN-019 — Window Control

Status: **PLANNED**

## Goal

ควบคุม native windows ด้วย identity ที่เสถียรกว่า pixel

## Planned capabilities

list_windows, get_window, focus_window, move_window, resize_window, minimize_window, maximize_window, close_window

## Design notes

HWND + PID + title/class evidence; multi-monitor coordinates

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