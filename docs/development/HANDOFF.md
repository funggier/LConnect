# LConnect Session Handoff

Last updated: **2026-10-17**

Use this file when starting a new ChatGPT/agent session.

## Repository

```text
https://github.com/funggier/LConnect
```

Default branch: `main`

Source root:

```text
T:\Sanbox\openclawspace\LConnect-github
```

Installed/runtime root:

```text
T:\Sanbox\openclawspace\tunnel-mcp-ok
```

## Required first reads

Read in this order:

1. [ACTIVE.md](ACTIVE.md)
2. [STATUS.md](STATUS.md)
3. [ROADMAP.md](ROADMAP.md)
4. [DECISIONS.md](DECISIONS.md)
5. [TASK_INDEX.md](TASK_INDEX.md)
6. latest full handoff:
   [reports/LCN-20261002-full-session-handoff-post-v1.2.2-tool-development-resumption.md](reports/LCN-20261002-full-session-handoff-post-v1.2.2-tool-development-resumption.md)
7. the task being activated

## Working rule

**GitHub/current repository state and live runtime are authoritative.**

Before continuing:

- verify current `main` / `origin/main`
- verify worktree state
- verify direct `runtime_catalog`
- do not assume historical SHAs are current
- do not reset the worktree simply to match an older handoff

## Current published baseline

- release: **v1.3.1 — Operational Hardening & Optional Autostart**
- release/tag commit: `e12bb90b4246ea4bb487894e6f3b6ddb96210d14`
- annotated tag object: `8f0aeb43132e29c4bf8893aa71229f950c2c3208`
- release CI: #180 / run `37819874520` — SUCCESS
- release-qualification runtime: **1.3.1 / 154 tools / PID 14920** (historical; obtain current PID live)
- source/install release parity: **261/261 exact**
- catalog digest: `2ca33225b970dd70e1350d7b4e3d9290116448181031872d643111ae7ab4c374`
- public duplicate tool names: **none**
- managed Firefox/Chrome physical qualification: GREEN
- live Windows UIA Thai/Unicode qualification: GREEN
- secure DPAPI credential + detached self-restart: live GREEN
- published assets: 12; downloaded-back hash mismatch: 0

`v1.3.1`, `v1.3.0` and historical `v1.2.2` tags/releases are immutable release evidence. Do not move or overwrite them.

## Current direction

Foundation/reliability work through LCN-053 is complete.

Resume the deferred tool expansion in this order:

```text
LCN-018 Clipboard — COMPLETE
LCN-019 Window Control — COMPLETE
LCN-020 Keyboard / Mouse — COMPLETE
LCN-021 Browser Common Layer — COMPLETE
LCN-022 Firefox Adapter — COMPLETE
LCN-023 Chrome Adapter — COMPLETE
LCN-054 Browser Control Hardening & Live Safety Boundary — COMPLETE
LCN-055 Tool Surface Cleanup & Contract Normalization — COMPLETE
```

LCN-056 v1.3.0 Desktop & Browser Automation Release — **COMPLETE / PUBLISHED / DEPLOYED / LIVE GREEN**.

LCN-057 Security & Operational Hygiene is **COMPLETE / DEPLOYED / LIVE GREEN**. LCN-058 Optional AtLogOn Persistence is **COMPLETE / DEPLOYED / PHYSICAL GREEN**. LCN-059 v1.3.1 Operational Hardening Release is **COMPLETE / PUBLISHED / DEPLOYED / LIVE GREEN** at exact release commit `e12bb90b4246ea4bb487894e6f3b6ddb96210d14`, CI #180 SUCCESS. LCN-060 Windows Long Path Compatibility Hardening is **COMPLETE / DEPLOYED / LIVE GREEN** at implementation `1f6bf8b721631bd7fefb1d74eb99c2ade02aea40`, CI #184 SUCCESS. LCN-062 Context Efficiency & Conditional Read Cache is **COMPLETE / DEPLOYED / RUNTIME GREEN** at implementation `4b9f6beeeb12351f42bf44de1362bd2543024f5e`, exact-commit CI #189 / run `39020912202` SUCCESS, activation parity 267/267 exact and runtime 1.3.1 / 154 tools. The active runtime observed at closure was PID 30876; PID is volatile and must be re-read live. A ChatGPT client whose LConnect schema was loaded before LCN-062 must refresh/reload the connector/plugin before it can send the new `known_digest` and `cache_max_age_ms` fields. Default `\\LConnect Autostart` remains absent. No active development task.

Browser Automation through LCN-054 is complete at current scope. LCN-055 normalized the resulting 154-tool public surface. LCN-056 published that completed mainline as v1.3.0.

LCN-054 browser hardening and LCN-055 tool-surface normalization are included in v1.3.0. Release commit `3e685ba0596bf00b9e4546c0dc8d9293fbdbd761` / CI #171 qualified at 247/247 release parity; release-qualification runtime was 1.3.0 / 154 tools / PID 17900 / no duplicate names. Current runtime identity must be read live.

## Browser decisions

- Firefox is primary / first-class
- Firefox baseline: WebDriver BiDi; geckodriver/Marionette where useful
- Chrome is secondary through CDP
- Edge is not required
- common browser API sits above adapters
- keyboard/mouse input is fallback, not browser DOM strategy

## Development expectations

- modular Core
- one main MCP channel
- structured tools rather than ad-hoc raw-shell surfaces where practical
- bounded output
- explicit timeout/cancellation semantics
- tests + exact-commit CI
- long-running work uses session/job patterns
- deploy with source/install parity evidence
- runtime acceptance after production module changes
- update task/status/history after meaningful work
- preserve `mcp-conf.yaml`, `node_modules/`, `logs/`, `runtime/`, `tunnel-client.exe`, `local-secrets/`
- never commit tunnel configuration or secrets
