# LCN-021 — Browser Common Layer Completion Report

Date: **2026-10-02 (+07)**

Result: **COMPLETE / DEPLOYED / LIVE GREEN**

## Scope delivered

Added nine adapter-neutral browser MCP tools:

- `browser_start`
- `browser_attach`
- `browser_stop`
- `browser_tabs`
- `browser_navigate`
- `browser_snapshot`
- `browser_click`
- `browser_type`
- `browser_screenshot`

## Architecture

LCN-021 implements the browser common layer only.

The common layer owns:

- public `browser_session_id`
- browser session registry
- adapter registration
- capability declaration and per-session capability negotiation
- JSON-safe adapter result handling
- bounded result enforcement
- backend-unavailable/session-not-found/capability errors

Adapters own private backend handles. Those handles are retained inside the registry and are not included in public MCP results.

Supported backend names at this architecture boundary:

- `firefox` — primary, implementation belongs to LCN-022
- `chrome` — secondary, implementation belongs to LCN-023

Microsoft Edge is intentionally not a dependency.

## Safety / failure model

- no silent fallback from DOM/browser operations to native keyboard/mouse
- unregistered backends fail with `BROWSER_BACKEND_UNAVAILABLE`
- unknown public session IDs fail with `BROWSER_SESSION_NOT_FOUND`
- unsupported operations fail before adapter dispatch with `BROWSER_CAPABILITY_UNAVAILABLE`
- malformed adapter declarations/results fail with `BROWSER_ADAPTER_PROTOCOL_ERROR`
- oversized generic results fail with `BROWSER_RESULT_TOO_LARGE`
- browser options and MCP fields are bounded
- screenshots have an explicit `max_bytes` contract

## Local qualification

Baseline:

- main/origin main: `d0ba9ea1bac36439a2b0b52daf411765af0af462`
- worktree: clean
- runtime: LConnect 1.2.2 / 139 tools / PID 18436

Fake-adapter/common-layer tests:

- adapter registration/capabilities: PASS
- common public session ID creation: PASS
- private backend handle isolation: PASS
- `browser_start`: PASS
- `browser_attach`: PASS
- `browser_stop`: PASS
- `browser_tabs`: PASS
- `browser_navigate`: PASS
- `browser_snapshot`: PASS
- `browser_click`: PASS
- `browser_type`: PASS
- `browser_screenshot`: PASS
- missing-session guard: PASS
- capability negotiation guard: PASS
- unavailable backend contract: PASS
- bounded result guard: PASS
- session cleanup: PASS

Production MCP surface:

- common browser tools registered: PASS
- source test catalog: **148 tools**
- production-without-adapter `browser_start(browser="firefox")`: explicit `BROWSER_BACKEND_UNAVAILABLE` PASS

Full qualification:

- `npm run check`: PASS
- full `npm test`: PASS / exit 0
- `npm audit --audit-level=high`: PASS / 0 vulnerabilities
- `git diff --check`: PASS

## Exact-commit CI

Implementation commit:

`a67979c1fdf66a0ad8442f8995048fa2decd2693`

GitHub CI:

- run: `36985092594`
- run number: **#157**
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

- tracked parity: **224/224 exact**
- missing: 0
- changed: 0
- source/install manifest digest:
  `ce6fa8d175961714d3750627804ca67f6e8fce55d69b7d94b0d406d2dbff48b3`
- preserved paths: **6/6 present**

Preserved local paths:

- `mcp-conf.yaml`
- `node_modules/`
- `logs/`
- `runtime/`
- `tunnel-client.exe`
- `local-secrets/`

Encrypted credential SHA-256 before and after deployment/restart:

`b773cace3931586913b84460c4b00cbd1ce33b78a165fa77355e259470cf2665`

## Live runtime evidence

Self-restart completed successfully.

Live runtime:

- version: `1.2.2`
- PID: `14632`
- tool count: **148**
- catalog digest:
  `22529451eafb21024aa132a0dad5fcbe96651c542234695a0f0db565e078ab7d`
- runtime root:
  `T:\Sanbox\openclawspace\tunnel-mcp-ok`

Live runtime catalog contains all nine Browser Common tools.

Installed post-restart browser-common smoke: **PASS**.

## Coordination repair

While closing LCN-021, stale historical coordination entries that still marked LCN-018–021 as DEFERRED were corrected in `STATUS.md` and `TASK_INDEX.md`.

## Release integrity

The existing `v1.2.2` tag/release was not moved, recreated, overwritten, or republished.

## Next task

**LCN-022 — Firefox Adapter**

Firefox remains the primary browser backend. The planned baseline is WebDriver BiDi, using geckodriver/Marionette where useful.

Verify live GitHub/runtime state before activation.
