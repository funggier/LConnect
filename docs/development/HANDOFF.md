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

- release: **v1.2.2 — Secure Restart & Local Credentials**
- release/tag commit: `fcf3d75c6314706e3258b6c5d1345b6f637ac78f`
- LCN-055 implementation: `885229e72380882aa6239996d0647a33e4148400`
- implementation CI: #167 / run `37003411662` — SUCCESS
- LCN-055 closure documentation commit: `ea3935eee1ab0f7fa3c2d301487fcc58ecd71390`
- closure CI: #168 / run `37004582819` — SUCCESS
- runtime: **1.2.2 / 154 tools / PID 4704**
- source/install tracked parity after LCN-055: **245/245 exact**
- public duplicate tool names: **none**
- secure DPAPI credential + detached self-restart: live GREEN

The tag is immutable release evidence. Do not move or overwrite `v1.2.2`.

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

Next intended task: **LCN-056 — Desktop & Browser Automation Release**. Confirm current version/release policy before changing the version.

Browser Automation through LCN-054 is complete at current scope. LCN-055 normalized and qualified the resulting 154-tool public surface. There is no active capability-development task.

LCN-054 is complete at implementation commits `e4612e4497469596551b77a1c6eb763888519e13` and `0b139a18f6f303025635039f912f3ee16c74eb05`; exact-commit CI #164 and #165 PASS; physical Firefox/Chrome and live UIA GREEN. LCN-055 implementation `885229e72380882aa6239996d0647a33e4148400` / CI #167 SUCCESS is deployed at 245/245 tracked parity; live runtime 154 tools / PID 4704 / no duplicate names.

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
