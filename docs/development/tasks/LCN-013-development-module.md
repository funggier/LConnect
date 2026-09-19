# LCN-013 — Development Module

Status: **PLANNED**

## Goal

สร้าง abstraction สำหรับ development workflow หลาย project type

## Planned capabilities

detect_project, detect_build_system, project_info, install_dependencies, run_build, run_tests, run_lint

## Design notes

งานยาวใช้ job/session pattern ไม่แขวน MCP call

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