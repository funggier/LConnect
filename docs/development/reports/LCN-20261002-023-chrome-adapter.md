# LCN-023 — Chrome Adapter Completion Report

Date: **2026-10-02 (+07)**

Result: **COMPLETE / DEPLOYED / LIVE GREEN**

## Scope delivered

LCN-023 adds Chrome as the secondary browser backend behind the LCN-021 Browser Common Layer without adding new public MCP tool names.

Existing browser tools now support both Firefox and Chrome backends:
- browser_start
- browser_attach
- browser_stop
- browser_tabs
- browser_navigate
- browser_snapshot
- browser_click
- browser_type
- browser_screenshot

## Architecture

Implemented:
`modules/browser-chrome.mjs`

Backend baseline:
- native Chrome DevTools Protocol (CDP)
- Node 24 built-in WebSocket
- no ChromeDriver
- no Edge dependency
- managed loopback remote-debugging endpoint
- isolated managed `--user-data-dir`
- browser-common session identity kept separate from CDP target identity

## Chrome baseline

Binary:
`C:\Program Files\Google\Chrome\Application\chrome.exe`

Physical version:
`154.0.8037.93`

CDP protocol:
`1.3`

Native Node WebSocket → CDP `Browser.getVersion`: PASS.

## Safety / session model

Managed start:
- binds CDP to 127.0.0.1
- uses isolated user-data-dir
- never reuses normal user Chrome profile by default
- owns and cleans only the managed process tree/profile

Attach:
- requires explicit CDP HTTP endpoint
- remote endpoint blocked unless explicitly opted in
- no endpoint guessing

DOM actions use CDP Runtime/Page APIs. Native keyboard/mouse is not used as a DOM fallback.

## Primary target identity repair

First physical run showed that Chrome could expose multiple page targets and the adapter initially selected the first /json/list entry when tab_id was omitted.

Repair:
- managed start records a default/primary CDP target ID
- operations without tab_id use this target
- tabs mark that target active
- target fallback avoids chrome:// internal pages when possible

Physical rerun after repair: PASS.

## Local qualification

PASS:
- adapter registration/capabilities
- explicit Chrome binary resolution
- attach endpoint guard
- remote endpoint guard
- endpoint scheme guard
- click capability guard
- Browser Common MCP Chrome registration contract
- managed Chrome/CDP start
- tabs
- DOM snapshot
- Unicode/Thai type
- DOM click
- post-click DOM state
- screenshot: 9,073 bytes
- full-page screenshot: 9,073 bytes
- navigate / readyState complete
- managed stop/cleanup
- managed process residue matching lconnect-chrome-: 0
- full npm test: exit 0
- npm run check
- npm audit --audit-level=high: 0 vulnerabilities
- git diff --check

Catalog remains **148 tools** because LCN-023 adds a backend behind the existing browser tools.

## Exact implementation CI

Implementation commit:
`a0faf6186f57417dabafe049a091ac226176b4db`

GitHub CI:
- workflow: LConnect CI
- run: #161
- run ID: `36989805413`
- exact head SHA: implementation commit
- result: **SUCCESS**

## Deployment evidence

Implementation deployment before closure docs:
- tracked parity: **232/232 exact**
- source/install manifest digest:
  `1e468c7a742cead2fc944fc271452acd831e46480de5046656439f8c36d864f5`
- missing: 0
- changed: 0
- preserved paths: 6/6

Encrypted credential SHA-256 unchanged:
`b773cace3931586913b84460c4b00cbd1ce33b78a165fa77355e259470cf2665`

## Live runtime

After deployment/restart:
- version: `1.2.2`
- PID: `17012`
- tool count: **148**
- catalog digest:
  `22529451eafb21024aa132a0dad5fcbe96651c542234695a0f0db565e078ab7d`
- root:
  `T:\Sanbox\openclawspace\tunnel-mcp-ok`

Installed post-restart physical Chrome smoke: PASS.
Installed Browser Common registration smoke: PASS.

## Release integrity

Existing v1.2.2 release/tag remains immutable. LCN-023 did not move or overwrite the release/tag.

## Browser automation milestone

LCN-021 Browser Common Layer: COMPLETE
LCN-022 Firefox Adapter (primary): COMPLETE
LCN-023 Chrome Adapter (secondary): COMPLETE

The planned Browser Automation layer through LCN-023 is now complete at current scope.
