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
- current implementation main before LCN-023 closure docs: `a0faf6186f57417dabafe049a091ac226176b4db`
- runtime: **1.2.2 / 148 tools**
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
```

Browser Automation through LCN-023 is complete at current scope. There is no active browser-development task.

LCN-023 is complete at implementation commit `a0faf6186f57417dabafe049a091ac226176b4db`, exact-commit CI #161 PASS, physical Chrome 154.0.8037.93 / CDP 1.3 GREEN, deployed runtime 148 tools.

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
