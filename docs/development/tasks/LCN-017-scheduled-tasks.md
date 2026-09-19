# LCN-017 — Scheduled Tasks

Status: **COMPLETE**

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
- First GitHub CI run `35453528934` reached the disposable task lifecycle and failed at `disable_scheduled_task` because Windows ScheduledTasks lifecycle cmdlets emitted a formatted task object before the JSON contract.
- Root cause: unsuppressed PowerShell pipeline output, not lifecycle failure.
- Fixed all lifecycle cmdlet invocations to pipe their native output to `Out-Null`; LConnect stdout is reserved for the structured JSON result.

## Completion evidence

- Implementation commit: `bfd1dc0ca68323bcfd8f08e11c544cf476e3ee05`
- Structured-output fix commit: `50d10ee3be2c76c76a6494f7bdfbba77c9775f51`
- Passing GitHub Actions run: `35453726763`
- Windows CI runtime smoke: catalog = 91 tools
- list/exact lookup: PASS
- disposable task create: PASS
- disable/enable: PASS
- run marker action: PASS
- stop: PASS
- delete + cleanup: PASS
- dependency audit: 0 vulnerabilities

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