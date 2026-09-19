# LCN-009 — Windows Services

Status: **COMPLETE**

## Goal

ควบคุม persistent Windows runtimes โดยไม่พึ่ง raw PowerShell

## Planned capabilities

list_services, get_service, start_service, stop_service, restart_service, set_service_startup

## Design notes

ใช้ native service APIs; preserve permission/SCM errors

## Progress

- 2026-09-19: Started from coordination HEAD `d21896bcc17c59c268344b2e9a6107ec1ec9b409`.
- RED established: smoke catalog expected six service tools and failed because implementation was absent.
- Exact Windows service `Name` is the mutation identity; display-name/wildcard matching is not used for destructive operations.
- Added `modules/services.mjs`.
- Added `tests/services-smoke.mjs`.
- Local read-only acceptance: `list_services`, exact-name `get_service EventLog`, and missing-service behavior PASS.
- Local catalog: 41 tools.
- Lifecycle/startup mutation tests are CI-only and use a disposable compiled Windows Service with cleanup in `finally`.
- `npm run check`: PASS.
- `npm test`: PASS locally.
- `npm audit --audit-level=moderate`: 0 vulnerabilities.

## Completion evidence

- Implementation commit: `bddad237d913db60a6afd8703654181b6bef0a43`
- GitHub Actions run: `35448002152` — PASS
- Windows CI runtime smoke: catalog = 41 tools
- read-only service inspection: PASS
- exact-name lookup: PASS
- disposable CI service startup-mode mutation: PASS
- disposable CI service start/restart/stop lifecycle: PASS
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