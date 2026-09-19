# LCN-013 — Development Module

Status: **ACTIVE**

## Goal

สร้าง abstraction สำหรับ development workflow หลาย project type

## Planned capabilities

detect_project, detect_build_system, project_info, install_dependencies, run_build, run_tests, run_lint

## Design notes

งานยาวใช้ job/session pattern ไม่แขวน MCP call

## Progress

- 2026-09-19: Started from coordination HEAD `d46492f7f7876f5f90f5be78b269a4376aca9134`.
- RED established: smoke catalog expected seven Development tools and failed because implementation was absent.
- Refactored `process.mjs` to expose the existing managed-process session registry for reuse without changing the public process-tool contract.
- Added `modules/development.mjs` and `tests/development-smoke.mjs`.
- Long-running install/build/test/lint actions reuse the existing session registry; no duplicate job registry.
- Windows `.cmd/.bat` package managers are session-launched through PowerShell argv-safe wrapping to avoid known direct-spawn EINVAL behavior.
- First executable project type is Node; other detected ecosystems are reported as unsupported for execution rather than guessed.
- Disposable Node project acceptance PASS: detection, build-system metadata, project info, npm install, build, test, lint and shared session registry.
- Local catalog: 70 tools.
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