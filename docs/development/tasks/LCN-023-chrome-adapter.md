# LCN-023 — Chrome Adapter

Status: **COMPLETE**

## Goal

Make Chrome the secondary browser backend behind the LCN-021 Browser Common Layer for cross-browser testing and debugging, without depending on Edge or ChromeDriver.

## Planned capabilities

- managed Chrome start through native Chrome DevTools Protocol (CDP)
- isolated managed user-data directory; never reuse the user's normal Chrome profile by default
- common operations: stop, tabs, navigate, snapshot, click, type, screenshot
- deterministic attach only when an explicit CDP HTTP endpoint is supplied
- bounded CDP request/response handling and explicit target/session identity

## Design notes

- CDP backend; no Edge dependency and no ChromeDriver dependency
- Chrome resolution: explicit option → `LCONNECT_CHROME_BINARY` → standard Windows install locations → PATH
- managed start binds remote debugging to loopback with an isolated `--user-data-dir`
- attach fails closed unless an explicit endpoint is supplied; non-loopback endpoint requires explicit opt-in
- browser-common session IDs remain independent from CDP target/session IDs
- preserve a Chrome/CDP-specific escape hatch internally without widening the public common API in this task
- keyboard/mouse tools remain fallback only; DOM actions must use CDP

## Local qualification evidence

- live baseline before implementation: main/origin main `10ffeaf55914ddcf7e757edaa6d827351a33263c`, clean worktree
- runtime before deployment: LConnect 1.2.2 / 148 tools / PID 18280
- Chrome detected: `C:\Program Files\Google\Chrome\Application\chrome.exe`, version `154.0.8037.93`
- ChromeDriver: not present and not required
- native Node 24 WebSocket → CDP `Browser.getVersion`: PASS
- managed CDP loopback start with isolated user-data-dir: PASS
- primary/default CDP target identity repair after first physical run: PASS
- tabs / navigate / snapshot / click / type / screenshot / full-page screenshot: PASS
- Unicode/Thai physical typing + post-click DOM state verification: PASS
- physical screenshot: 9,073 bytes
- physical full-page screenshot: 9,073 bytes
- managed stop/cleanup: PASS
- managed Chrome residue matching `lconnect-chrome-`: 0
- existing user Chrome process tree was not used as managed profile
- deterministic smoke: registration, explicit binary resolution, attach endpoint guard, remote endpoint guard, scheme guard, click capability guard: PASS
- Browser Common MCP registration contract for Chrome: PASS
- full `npm test`: PASS / exit 0
- source catalog remains **148 tools**
- `npm run check`: PASS
- `npm audit --audit-level=high`: PASS / 0 vulnerabilities
- `git diff --check`: PASS

## Final qualification evidence

- implementation commit: `a0faf6186f57417dabafe049a091ac226176b4db`
- exact implementation CI: #161 / run `36989805413` — **PASS**
- Chrome physical baseline: `154.0.8037.93`
- CDP protocol: `1.3`
- ChromeDriver dependency: none
- native Node 24 WebSocket CDP probe: PASS
- managed isolated Chrome profile + loopback CDP: PASS
- primary target identity repair: PASS
- tabs / navigate / snapshot / click / type / screenshot / full-page screenshot: PASS
- Unicode/Thai physical input + post-click DOM verification: PASS
- installed post-restart physical Chrome smoke: PASS
- managed Chrome residue matching `lconnect-chrome-`: 0
- deployed tracked parity before closure docs: **232/232 exact**
- source/install manifest digest: `1e468c7a742cead2fc944fc271452acd831e46480de5046656439f8c36d864f5`
- encrypted credential SHA-256 unchanged: `b773cace3931586913b84460c4b00cbd1ce33b78a165fa77355e259470cf2665`
- live runtime after restart: LConnect `1.2.2`, PID `17012`, **148 tools**
- runtime catalog digest: `22529451eafb21024aa132a0dad5fcbe96651c542234695a0f0db565e078ab7d`

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