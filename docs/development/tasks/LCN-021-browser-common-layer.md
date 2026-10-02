# LCN-021 — Browser Common Layer

Status: **ACTIVE**

## Goal

Create a backend-independent browser session API above Firefox/Chrome adapters, with one common session registry and explicit capability negotiation.

## Planned capabilities

- `browser_start`
- `browser_attach`
- `browser_stop`
- `browser_tabs`
- `browser_navigate`
- `browser_snapshot`
- `browser_click`
- `browser_type`
- `browser_screenshot`

## Design notes

- common API owns public `browser_session_id` values; adapters keep backend-native session handles private
- adapters register under explicit backend names (`firefox`, `chrome`); Edge is intentionally unsupported
- each adapter declares capabilities; common layer rejects unsupported operations before adapter dispatch
- LCN-021 ships the common layer without embedding either concrete backend; unavailable backends fail explicitly
- LCN-022 will register Firefox/WebDriver BiDi; LCN-023 will register Chrome/CDP
- all adapter results are JSON-safe and bounded by the common layer
- browser DOM operations stay above native keyboard/mouse fallback

## Local qualification evidence

- live baseline before implementation: main/origin main `d0ba9ea1bac36439a2b0b52daf411765af0af462`, clean worktree
- runtime before deployment: LConnect 1.2.2 / 139 tools / PID 18436
- common adapter registry + capability declaration validation: PASS
- public common session IDs with private backend handles not exposed: PASS
- `browser_start`: PASS with fake adapter
- `browser_attach`: PASS with fake adapter
- `browser_stop`: PASS with fake adapter
- `browser_tabs`: PASS
- `browser_navigate`: PASS
- `browser_snapshot`: PASS
- `browser_click`: PASS
- `browser_type`: PASS
- `browser_screenshot`: PASS
- missing-session guard: PASS
- per-session capability negotiation guard: PASS
- unavailable production backend contract: PASS / `BROWSER_BACKEND_UNAVAILABLE`
- bounded adapter result guard: PASS / `BROWSER_RESULT_TOO_LARGE`
- MCP production registration: PASS; test catalog = 148 tools
- full `npm test`: PASS / exit 0
- `npm run check`: PASS
- `npm audit --audit-level=high`: PASS / 0 vulnerabilities
- `git diff --check`: PASS
- no Firefox/Chrome concrete adapter embedded in LCN-021; LCN-022/023 remain responsible for backend registration

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