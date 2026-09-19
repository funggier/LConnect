# LCN-007 — Environment Module

Status: **ACTIVE**

## Goal

ทำ structured environment/PATH/executable resolution เป็นฐานของ diagnostics และ development

## Planned capabilities

env_get, env_list, env_set, path_list, which

## Design notes

แยก process/user/machine scope; mutation semantics ชัด; PATH/PATHEXT จริง

## Progress

- 2026-09-19: RED established — smoke test expected all 5 environment tools and failed because implementation was not registered yet.
- Development baseline: `43490112b049b80b43507abc3e801a29015f02ee`
- Added `modules/environment.mjs` and registered it in the Core.
- Added `tests/environment-smoke.mjs`.
- First PATHEXT test exposed a real bug: `which npm` selected the extensionless Node distribution file `npm` instead of `npm.cmd`.
- Fixed Windows resolution so a command without an extension is expanded through PATHEXT instead of accepting an extensionless file first.
- Local GREEN: `npm run check` PASS.
- Local GREEN: `npm test` PASS with 30 discovered tools.
- Environment tests PASS: process get/list/set/delete, process PATH, user environment read, Node resolution, PATHEXT npm resolution.
- `npm audit --audit-level=moderate`: 0 vulnerabilities.
- Persistent user mutation is intentionally exercised only on CI and cleaned up in `finally` so local development does not alter the operator's persistent environment.

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