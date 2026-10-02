# LCN-022 — Firefox Adapter Completion Report

Date: **2026-10-02 (+07)**

Result: **COMPLETE / DEPLOYED / LIVE GREEN**

## Scope delivered

LCN-022 turns the LCN-021 Browser Common Layer into a real Firefox-backed browser automation surface without adding new public MCP tool names.

The existing common tools are now backed by Firefox:

- `browser_start`
- `browser_attach`
- `browser_stop`
- `browser_tabs`
- `browser_navigate`
- `browser_snapshot`
- `browser_click`
- `browser_type`
- `browser_screenshot`

Firefox remains the primary / first-class browser backend.

## Architecture

Implemented:

`modules/browser-firefox.mjs`

The adapter:

- manages geckodriver on a loopback-only WebDriver endpoint
- launches an isolated Firefox managed session/profile
- requests `webSocketUrl: true` during New Session so the resulting Firefox session exposes a WebDriver BiDi endpoint
- keeps backend-native WebDriver session IDs and process handles private behind the common browser-session registry
- uses WebDriver Classic endpoints for stable common DOM operations while retaining the BiDi URL for deeper protocol/event work
- supports explicit deterministic attach only when endpoint + existing session identity are supplied
- does not silently fall back to native keyboard/mouse for DOM operations

## Driver and browser discovery

geckodriver resolution order:

1. `options.geckodriver_path`
2. `LCONNECT_GECKODRIVER`
3. installed local-only `runtime/browser-drivers/geckodriver.exe`
4. local `browser-drivers/geckodriver.exe`
5. PATH

Firefox resolution order:

1. `options.firefox_binary`
2. `LCONNECT_FIREFOX_BINARY`
3. standard Windows Firefox install paths
4. PATH

No geckodriver binary is committed to Git or added to the immutable v1.2.2 release.

## Local runtime driver

Installed local-only:

`T:\Sanbox\openclawspace\tunnel-mcp-ok\runtime\browser-drivers\geckodriver.exe`

Version:

`0.37.1`

SHA-256:

`e95b4eac7960ffcd5acbfd92bb7d49d48f99c1d01a20ddd297fef8c80821020d`

The binary lives under preserved local runtime state and remained byte-identical through tracked-file deployment.

## Firefox physical baseline

Managed qualification binary:

`C:\Program Files\Mozilla Firefox\firefox.exe`

Observed version:

`140.15.0esr`

The user's already-running normal Firefox tree under:

`C:\DATAstore\Mozilla Firefox\firefox.exe`

was not used as the managed automation target and was not modified or terminated.

## Safety and attach model

Managed start:

- uses a temporary managed profile root
- binds geckodriver to `127.0.0.1`
- negotiates a Firefox WebDriver session and BiDi `webSocketUrl`
- cleans owned driver/profile state during stop

Attach:

- requires an explicit WebDriver endpoint
- requires an explicit existing `session_id`
- non-loopback endpoints are rejected unless the caller explicitly opts in with `allow_remote_endpoint=true`
- no endpoint/session discovery guessing is performed

Common DOM click currently supports:

- left button
- click count 1

Unsupported button/count combinations fail explicitly with `FIREFOX_CAPABILITY_LIMIT`; they are not silently converted to native mouse input.

## Mock WebDriver qualification

A local mock WebDriver server validated protocol mapping without needing a real browser process.

PASS:

- Firefox adapter registration/capability set
- deterministic attach
- private native WebDriver session isolation
- tab enumeration
- original-tab restore
- navigation
- DOM snapshot
- DOM click
- Unicode/Thai element input
- standard screenshot
- Firefox full-page screenshot endpoint mapping
- unsupported click-mode guard
- attached-session stop/detach
- remote endpoint guard
- missing endpoint guard

## Physical Firefox qualification

A disposable loopback web fixture and managed headless Firefox session were used.

PASS:

- managed Firefox start
- Firefox version: `140.15.0`
- WebDriver BiDi `webSocketUrl` negotiated
- tab enumeration
- DOM snapshot
- Unicode/Thai input
- DOM click
- post-click DOM state verification
- screenshot: **25,514 bytes**
- navigation
- `document.readyState === "complete"`
- WebDriver session delete
- managed geckodriver cleanup

After physical testing:

- geckodriver process count: **0**

## Regression repair

The first full regression run failed because the LCN-021 browser-common test still expected production Firefox to be unavailable.

That expectation became stale once LCN-022 registered the Firefox adapter.

The test was repaired to assert the new deterministic contract instead:

- Firefox backend is registered
- `browser_attach(browser="firefox")` without an explicit endpoint fails with `FIREFOX_ATTACH_REQUIRES_ENDPOINT`

After repair:

- `browser-common-smoke`: PASS
- `browser-firefox-smoke`: PASS
- full `npm test`: PASS / exit 0
- source catalog: **148 tools**
- `npm run check`: PASS
- `npm audit --audit-level=high`: PASS / 0 vulnerabilities
- `git diff --check`: PASS

## Exact implementation CI

Implementation commit:

`d5a864b4fe37c7c48de2e50851aff8de6901c2fd`

GitHub CI:

- workflow: LConnect CI
- run number: **#159**
- run ID: `36987829509`
- exact head SHA: implementation commit above
- result: **SUCCESS**
- Windows runtime smoke tests: PASS
- dependency audit: PASS

## Deployment evidence

Source root:

`T:\Sanbox\openclawspace\LConnect-github`

Installed root:

`T:\Sanbox\openclawspace\tunnel-mcp-ok`

Implementation deployment before closure docs:

- tracked parity: **228/228 exact**
- missing: 0
- changed: 0
- source/install manifest digest:
  `80ce64528e9280cd706d33a38421c0bbc46e72ca09c9cf42bfd5e8f85463d4b5`
- preserved paths: **6/6 present**

Preserved local paths:

- `mcp-conf.yaml`
- `node_modules/`
- `logs/`
- `runtime/`
- `tunnel-client.exe`
- `local-secrets/`

Encrypted credential SHA-256 before/after deployment and restart:

`b773cace3931586913b84460c4b00cbd1ce33b78a165fa77355e259470cf2665`

geckodriver SHA-256 before/after tracked deployment:

`e95b4eac7960ffcd5acbfd92bb7d49d48f99c1d01a20ddd297fef8c80821020d`

## Live runtime evidence

After deployment and restart:

- LConnect version: `1.2.2`
- PID: `18280`
- tool count: **148**
- catalog digest:
  `22529451eafb21024aa132a0dad5fcbe96651c542234695a0f0db565e078ab7d`
- runtime root:
  `T:\Sanbox\openclawspace\tunnel-mcp-ok`

Tool count remains 148 because LCN-022 adds a backend adapter behind the existing Browser Common tool names rather than registering additional public MCP tools.

Installed post-restart physical Firefox smoke: **PASS**.

Installed browser-common smoke with Firefox registration contract: **PASS**.

## Current-chat connector note

The live runtime catalog contains the browser tools, but this already-open ChatGPT conversation did not refresh its connector schema to expose direct `browser_*` tool methods. This is a connector/schema refresh boundary, not a runtime catalog failure.

## Release integrity

The existing `v1.2.2` release/tag remains immutable. LCN-022 did not move the tag, republish the release, or add geckodriver to release assets.

## Next task

**LCN-023 — Chrome Adapter**

Chrome remains secondary and should plug into the same Browser Common Layer, using CDP as its backend baseline.

Verify live GitHub/runtime state before activation.
