# LCN-017 — Scheduled Tasks

Status: **ACTIVE**

## Goal

จัดการ automation ที่อยู่ข้าม LConnect และ reboot

## Planned capabilities

list/get/create/run/stop/enable/disable/delete scheduled task

## Design notes

structured Task Scheduler wrapper; exact task identity for destructive action

## Progress

- 2026-09-19: Started from coordination HEAD `3d2e84729cf7d4d455170c18a5e9ac8f82d83f81`.
- RED established: smoke catalog expected eight Scheduled Task tools and failed because implementation was absent.
- Added `modules/scheduled-tasks.mjs` and `tests/scheduled-tasks-smoke.mjs`.
- Exact Scheduled Task identity is `task_path + task_name`; destructive/lifecycle tools do not accept wildcards.
- First create contract supports explicit executable/arguments/working directory plus once/daily/startup/logon triggers.
- Task registration uses the current LConnect Windows user without storing a password; run level defaults to Limited.
- Missing task folders can be created through Task Scheduler COM.
- Local read-only acceptance PASS: bounded list + exact/missing lookup.
- CI acceptance is configured to create a disposable task under `\\LConnectTests\\`, test disable/enable/run/stop/delete and marker-file execution, then cleanup task/folder.
- Local catalog: 91 tools.
- `npm run check`: PASS.
- `npm test`: PASS.
- `npm audit --audit-level=moderate`: 0 vulnerabilities.

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