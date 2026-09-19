# ACTIVE — LConnect Development

Last updated: 2026-09-19

## Current baseline

- Repository: `funggier/LConnect`
- Branch: `main`
- Current implementation HEAD: `d4740d159a180f72034bd34f9dd89c555470ee88`
- Latest released baseline: `v1.0.2 — Basic Recovery`
- Platform validated: Windows 10 x64 / Node.js 24 / Windows PowerShell 5.1
- OpenAI tunnel-client minimum: `0.0.14`
- MCP topology: one `main` channel, modular Core
- Current discovered tool catalog in tests: 54 tools

> Before modifying source, verify live GitHub/local HEAD.

## Active task

### LCN-012 — Git Module

Status: **READY**

Task: [tasks/LCN-012-git-module.md](tasks/LCN-012-git-module.md)

Purpose:

ทำ Git repository workflow เป็น structured MCP contract แทนการ parse human-oriented CLI output ซ้ำ ๆ และให้ mutations คืน exact SHA/ref evidence

Planned capabilities:

- `git_status`
- `git_diff`
- `git_log`
- `git_branch`
- `git_commit`
- `git_fetch`
- `git_pull`
- `git_push`
- `git_worktree`

## Immediate next steps

1. Establish RED catalog tests.
2. Define repository/root/HEAD/upstream structured schema.
3. Prefer stable Git porcelain/ref formats.
4. Keep mutation arguments explicit; avoid hidden force behavior.
5. Test in disposable local repositories including a local bare remote.
6. Update docs/tests.
7. Push and use GitHub CI as acceptance gate.

## Recently completed

### LCN-011 — Hardware

- implementation commit: `d4740d159a180f72034bd34f9dd89c555470ee88`
- CI run: `35448844056`
- result: PASS
- catalog: 54 tools
