# LCN-022 — Firefox Adapter

Status: **COMPLETE**

## Goal

Make Firefox the primary first-class browser backend behind the LCN-021 Browser Common Layer, with deterministic managed-session behavior on Windows 10.

## Planned capabilities

- managed Firefox start through geckodriver / Marionette
- request and retain WebDriver BiDi `webSocketUrl` for the session baseline
- common operations: stop, tabs, navigate, snapshot, click, type, screenshot
- deterministic attach only when an explicit compatible WebDriver endpoint/session is supplied
- explicit driver/browser discovery and bounded timeouts

## Design notes

- Windows 10 physical acceptance is required
- managed profile/session first; no mutation of the user's normal Firefox profile
- geckodriver binary is local/runtime state, never committed or bundled into the immutable v1.2.2 release
- driver resolution: explicit option → `LCONNECT_GECKODRIVER` → local runtime driver → PATH
- Firefox resolution: explicit option → `LCONNECT_FIREFOX_BINARY` → standard Windows install locations → PATH
- WebDriver Classic commands may implement common DOM operations under the same session; BiDi URL is retained for event/deeper protocol growth
- attach must fail closed unless endpoint/session identity is explicit and verifiable

## Local qualification evidence

- live baseline before implementation: main/origin main `2d44f599ba7056ad791913de67cc23156a29a77b`, clean worktree
- runtime before deployment: LConnect 1.2.2 / 148 tools / PID 14632
- Firefox detected: `C:\Program Files\Mozilla Firefox\firefox.exe`, version `140.15.0esr`
- geckodriver 0.37.1 installed local-only under installed `runtime/browser-drivers`
- geckodriver SHA-256: `e95b4eac7960ffcd5acbfd92bb7d49d48f99c1d01a20ddd297fef8c80821020d`
- Firefox adapter registration/common capability set: PASS
- deterministic explicit attach + native-session-handle isolation: PASS
- tab enumeration + original-tab restore: PASS
- navigate/ready-state mapping: PASS
- DOM snapshot via WebDriver execute script: PASS
- CSS element click: PASS
- Unicode/Thai text entry: PASS
- standard + Firefox full-page screenshot endpoint mapping: PASS
- non-left/multi-click unsupported behavior fails explicitly: PASS
- remote WebDriver endpoint blocked unless explicitly opted in: PASS
- physical managed headless Firefox start: PASS
- physical WebDriver BiDi `webSocketUrl` negotiation: PASS
- physical Firefox tabs/snapshot/type/click/state verification/screenshot/navigate: PASS
- physical screenshot evidence: 25,514 bytes
- physical managed stop/session delete: PASS
- no geckodriver process left after physical test
- existing user Firefox tree at `C:\DATAstore\Mozilla Firefox\firefox.exe` was not used as the managed test target
- first full regression exposed one stale LCN-021 expectation (Firefox backend unavailable); test repaired to the new registered-adapter contract
- full `npm test` after repair: PASS / exit 0
- source test catalog remains **148 tools** (adapter adds capability, not new MCP names)
- `npm run check`: PASS
- `npm audit --audit-level=high`: PASS / 0 vulnerabilities
- `git diff --check`: PASS

## Final qualification evidence

- implementation commit: `d5a864b4fe37c7c48de2e50851aff8de6901c2fd`
- exact implementation CI: #159 / run `36987829509` — **PASS**
- Firefox physical baseline: `140.15.0esr`
- geckodriver local runtime baseline: `0.37.1`
- geckodriver SHA-256: `e95b4eac7960ffcd5acbfd92bb7d49d48f99c1d01a20ddd297fef8c80821020d`
- managed Firefox session + private profile root: PASS
- WebDriver BiDi `webSocketUrl` negotiation: PASS
- deterministic explicit attach contract: PASS
- tabs / navigate / snapshot / click / type / screenshot common operations: PASS
- Unicode/Thai physical type and post-click DOM state verification: PASS
- installed post-restart physical Firefox smoke: PASS
- no managed geckodriver process left after acceptance
- deployed tracked parity before closure docs: **228/228 exact**
- source/install manifest digest: `80ce64528e9280cd706d33a38421c0bbc46e72ca09c9cf42bfd5e8f85463d4b5`
- preserved local paths: 6/6 present
- encrypted credential SHA-256 before/after deployment/restart: `b773cace3931586913b84460c4b00cbd1ce33b78a165fa77355e259470cf2665`
- live runtime after restart: LConnect `1.2.2`, PID `18280`, **148 tools**
- live runtime catalog digest: `22529451eafb21024aa132a0dad5fcbe96651c542234695a0f0db565e078ab7d`
- browser tool count remains unchanged because LCN-022 supplies a backend adapter rather than new MCP names
- existing user's Firefox process tree was not used as the managed test target

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