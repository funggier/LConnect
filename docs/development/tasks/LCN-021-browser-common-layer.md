# LCN-021 — Browser Common Layer

Status: **COMPLETE**

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

## Final qualification evidence

- implementation commit: `a67979c1fdf66a0ad8442f8995048fa2decd2693`
- exact implementation CI: #157 / run `36985092594` — **PASS**
- common adapter registration/capability negotiation: PASS
- public browser-session registry with private backend handles: PASS
- all 9 common operations exercised through fake adapter: PASS
- missing-session / unsupported-capability guards: PASS
- bounded adapter result guard: PASS
- production unavailable-backend contract: PASS
- installed post-restart smoke: PASS
- deployed tracked parity before closure docs: **224/224 exact**
- source/install manifest digest: `ce6fa8d175961714d3750627804ca67f6e8fce55d69b7d94b0d406d2dbff48b3`
- preserved local paths: 6/6 present
- encrypted credential SHA-256 before/after deployment/restart: `b773cace3931586913b84460c4b00cbd1ce33b78a165fa77355e259470cf2665`
- live runtime after restart: LConnect `1.2.2`, PID `14632`, **148 tools**
- live runtime catalog digest: `22529451eafb21024aa132a0dad5fcbe96651c542234695a0f0db565e078ab7d`
- live runtime catalog contains all 9 Browser Common tool names
- no concrete Firefox/Chrome backend embedded in LCN-021; LCN-022/023 remain backend implementation tasks

Result: **COMPLETE / DEPLOYED / LIVE GREEN**.

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