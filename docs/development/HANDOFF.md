# LConnect Session Handoff

Last updated: **2026-10-02**

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

- release: **v1.3.0 — Desktop & Browser Automation**
- release/tag commit: `3e685ba0596bf00b9e4546c0dc8d9293fbdbd761`
- annotated tag object: `ef06f0eab103acab6f54fabd981278e2f809199d`
- release CI: #171 / run `37009797481` — SUCCESS
- runtime: **1.3.0 / 154 tools / PID 17900**
- source/install release parity: **247/247 exact**
- catalog digest: `2ca33225b970dd70e1350d7b4e3d9290116448181031872d643111ae7ab4c374`
- public duplicate tool names: **none**
- managed Firefox/Chrome physical qualification: GREEN
- live Windows UIA Thai/Unicode qualification: GREEN
- secure DPAPI credential + detached self-restart: live GREEN
- published assets: 12; downloaded-back hash mismatch: 0

Both `v1.3.0` and historical `v1.2.2` tags/releases are immutable release evidence. Do not move or overwrite them.

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

There is no active development task. Future work must open a new numbered LCN task from current GitHub/runtime authority.

Browser Automation through LCN-054 is complete at current scope. LCN-055 normalized the resulting 154-tool public surface. LCN-056 published that completed mainline as v1.3.0.

LCN-054 browser hardening and LCN-055 tool-surface normalization are included in v1.3.0. Release commit `3e685ba0596bf00b9e4546c0dc8d9293fbdbd761` / CI #171 is deployed at 247/247 release parity; live runtime is 1.3.0 / 154 tools / PID 17900 / no duplicate names.

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
