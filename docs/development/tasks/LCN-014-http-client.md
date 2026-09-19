# LCN-014 — HTTP Client

Status: **ACTIVE**

## Goal

ทดสอบ API/health/local dashboards โดยไม่เปิด browser

## Planned capabilities

http_request, http_probe, http_headers, http_download

## Design notes

bounded body; explicit timeout/redirect; downloads to file

## Progress

- 2026-09-19: Started from coordination HEAD `8fdaf384b31af5f54ff85d9452997a4697a96a8b`.
- RED established: smoke catalog expected four HTTP tools and failed because implementation was absent.
- Added `modules/http.mjs` and `tests/http-smoke.mjs`.
- Response bodies are bounded; large bodies report truncation instead of consuming unbounded memory.
- Redirect and timeout behavior are explicit.
- Downloads use a temporary file + rename pattern and obey LConnect path access policy.
- Local HTTP fixture acceptance PASS: JSON/POST, redirect, bounded body, timeout, HEAD→GET probe fallback, headers, atomic download, overwrite protection and max-size cleanup.
- Local catalog: 74 tools.
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