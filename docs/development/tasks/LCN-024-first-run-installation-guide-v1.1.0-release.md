# LCN-024 — First-run Installation Guide + v1.1.0 Release

Status: **COMPLETE**

## Goal

ทำ onboarding สำหรับผู้ใช้ครั้งแรกให้เป็นแบบจับมือทำ และเผยแพร่ LConnect v1.1.0 จาก baseline 91 tools ที่ผ่าน LCN-017 แล้ว

## Why

เอกสารติดตั้งเดิมอธิบายแนวคิดถูกต้อง แต่ยังปล่อยให้ผู้ใช้เดาเองหลายจุด เช่น:

- ต้องสร้าง/แก้ `mcp-conf.yaml` อย่างไร
- Tunnel ID มาจากไหน
- Runtime API key ต่างจาก Admin key อย่างไร
- Organization ID ใส่ตรงไหน
- `lconnect-config.json` ค่าไหนควรเปลี่ยน/ไม่ควรเปลี่ยน
- หลัง Start แล้ว output แบบไหนถือว่าปกติ
- ถ้า connector ไม่เห็น tools ควรตรวจตรงไหนก่อน

นอกจากนี้ runtime ขยายจาก Basic 25 tools ไปเป็น 91 tools แล้ว จึงเหมาะกับ minor release ใหม่

## Scope

1. Rewrite `docs/INSTALLATION_TH.md` เป็น first-run walkthrough
2. Clarify local-only tunnel/profile/secret boundaries
3. Fix misleading launcher message about missing `mcp-conf.yaml`
4. Update README onboarding
5. Bump product version to 1.1.0
6. Run syntax/full tests/audit
7. Require GitHub CI PASS
8. Build clean release ZIP from tracked/tagged files
9. Publish Git tag + GitHub Release
10. Record final release evidence

## Release target

- Version: `1.1.0`
- Name: `LConnect v1.1.0 — Expanded Tools & First-Run Guide`
- Expected catalog: 91 tools
- tunnel-client minimum: 0.0.14
- tunnel configuration remains local-only

## Progress

- 2026-09-19: Started from clean main HEAD `2169aa1a4ad2a9b3ca61e95d00c6e0b4605b8c82`.
- Rewrote `docs/INSTALLATION_TH.md` as a step-by-step first-run guide covering Release ZIP/Git clone, prerequisite checks, Tunnel ID, Runtime API key, Organization ID, profile creation, exact file edits, Full-machine config, Start/Status, ChatGPT connector setup, test calls, upgrades and troubleshooting.
- Verified current OpenAI tunnel-client onboarding/configuration semantics against official documentation and the installed `tunnel-client 0.0.14` help/init behavior.
- Tested `tunnel-client init --profile mcp-conf --profile-dir "."` behavior with a disposable fake Tunnel ID and confirmed that it generates `mcp-conf.yaml`.
- Corrected `Start-LConnect.ps1` so a missing profile no longer incorrectly tells the user to rerun the installer.
- Added first-run next-step guidance to `Install-LConnect.ps1`.
- Updated README onboarding to point first-time users to the detailed walkthrough.
- Bumped package/runtime/test version to `1.1.0`.
- UTF-8 validation: PASS; no replacement characters or trailing-whitespace lines in the Thai guide.
- PowerShell syntax: PASS.
- `npm run check`: PASS.
- `npm test`: PASS / 91 tools.
- `npm audit --audit-level=moderate`: 0 vulnerabilities.

## Completion evidence

- Release candidate commit: `1078a9a8d6e21a390327c06941475ccea40fa6d4`
- Tag: `v1.1.0`
- Tag target: `1078a9a8d6e21a390327c06941475ccea40fa6d4`
- GitHub Actions run: `35454810096` — PASS
- Release: `https://github.com/funggier/LConnect/releases/tag/v1.1.0`
- Asset: `LConnect-v1.1.0-Expanded-Tools.zip`
- Asset size: `189559` bytes
- SHA-256: `0176C08D5FF1005559A7AD38943162133657A9A2FA8D5484E21D77BAFE81AA4A`
- GitHub asset digest matched local SHA-256
- Release is marked Latest
- ZIP audit: 112 entries, 0 forbidden local-only hits
- `mcp-conf.yaml`, `tunnel-client.exe`, `runtime/`, `logs/`, `node_modules/` are absent from the release asset

## Acceptance criteria

- installation guide is executable by a first-time Windows user without guessing required values
- no real Tunnel ID, API key, Organization ID, or local profile is committed
- launcher error text matches actual installer behavior
- package/runtime version is 1.1.0
- npm check/test/audit PASS
- GitHub CI PASS
- release ZIP excludes local-only secrets/runtime state
- GitHub Release published with exact commit/tag evidence
