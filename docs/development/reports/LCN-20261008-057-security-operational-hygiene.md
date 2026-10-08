# LCN-057 — Security & Operational Hygiene Closure Report

Date: 2026-10-08  
Status: **COMPLETE / DEPLOYED / LIVE GREEN**

## Baseline

LCN-057 started from post-v1.3.0 main commit `c4472cf8a85deb74ecf94681474b6b9bb3c2a378`.

Published release evidence remains immutable:
- v1.3.0 release commit: `3e685ba0596bf00b9e4546c0dc8d9293fbdbd761`
- historical v1.2.2 release remains unchanged

## Trigger

A live post-release audit found two newly applicable npm advisories:
- MCP TypeScript SDK: HIGH
- proxy-addr: CRITICAL

The same audit also found long-lived operational pressure points:
- recursive `search_files` could run for a long time with no traversal/time bound
- terminal managed sessions accumulated in the runtime registry
- raw telemetry ring eviction removed old per-tool detail
- turn-risk observation round 28 had remained active across multiple days/thousands of calls
- Windows `start_process` did not directly handle explicit .cmd/.bat launchers
- current-facing docs treated release-observed PIDs as durable current values

## Implementation

Exact implementation commit:

`c949c3239cc5ede9e285dfd605b0e62392bdde4b`

Changes:
- `@modelcontextprotocol/sdk` -> 1.32.1 installed line
- `proxy-addr` -> 2.0.8 transitive line
- `search_files`: max entries/depth/time/matches/output bounds
- managed session registry high-water mark: default 500, terminal-only eviction
- `list_sessions`: optional state/label/offset/limit/summary controls; default compatibility preserved
- `start_process`: safe Windows .cmd/.bat PowerShell wrapper
- telemetry: bounded raw ring + current-runtime lifetime per-tool aggregate
- turn-risk: observation-only idle rollover, default 1800 seconds, previous round retained in history
- current docs: volatile PID wording corrected

Public MCP catalog remains **154 tools**.

## Local qualification

- `npm run check`: PASS, 84 files
- full `npm test`: PASS, 39 Node suites + 1 PowerShell suite
- targeted filesystem/process/telemetry/latency regressions: PASS
- `npm audit --audit-level=high`: **0 vulnerabilities**
- dependency evidence: MCP SDK 1.32.1, proxy-addr 2.0.8
- `git diff --check`: PASS
- tool-surface guard: 154 tools, duplicate names none

During test development, one timing-sensitive process-session test initially failed because the new npm.cmd fixture was inserted before an existing short timeout fixture. The implementation was not at fault; the fixture was moved after the timing assertion and the complete targeted/full suites passed.

## Exact-commit CI

GitHub Actions:
- workflow: LConnect CI
- run: #175 / `37810517540`
- head: `c949c3239cc5ede9e285dfd605b0e62392bdde4b`
- conclusion: **SUCCESS**

Windows install, PowerShell syntax, syntax check, runtime smoke and dependency audit all passed.

## Deployment

Deployment method:
- assert exact source HEAD + clean worktree
- copy Git-tracked files only
- do not mirror-delete installed root
- preserve local config/secrets/runtime/logs/tunnel/dependencies
- refresh installed dependencies from the qualified package/lockfile

Tracked copy count: 249.

Pre-restart installed evidence:
- source/install tracked parity: **249/249 exact**
- manifest digest: `5fba7f221e52ba0af582ce0add6faa0d257634459071e619a33a2c075b5dfd67`
- MCP SDK: 1.32.1
- proxy-addr: 2.0.8
- installed npm audit: 0 vulnerabilities
- preserved paths: 6/6
- managed running sessions: 0

Encrypted credential SHA-256 before deployment/restart:
`b773cace3931586913b84460c4b00cbd1ce33b78a165fa77355e259470cf2665`

## Secure restart / live acceptance

Detached restart:
- log: `logs/restart-20261008-234423.log`
- completion: readiness PASS
- new tunnel PID observed: 17752
- new MCP PID: 15508
- runtime started: 2026-10-08T16:44:27.787Z

Live runtime:
- version: 1.3.0
- tools: 154
- catalog digest: `2ca33225b970dd70e1350d7b4e3d9290116448181031872d643111ae7ab4c374`
- duplicate names: none
- source/install tracked parity: **249/249 exact**
- manifest digest: `5fba7f221e52ba0af582ce0add6faa0d257634459071e619a33a2c075b5dfd67`

Physical/live changed-path evidence:
- `start_process(program="npm.cmd", args=["--version"])`: PASS, launcher `windows_powershell_batch_wrapper`, exit 0
- `search_files` bounded-result trailer: PASS
- `latency_budget_status.idle_rollover_seconds`: 1800
- `tool_telemetry.lifetime_summary`: present
- installed runtime session snapshot carries launcher evidence

Encrypted credential SHA-256 after restart:
`b773cace3931586913b84460c4b00cbd1ce33b78a165fa77355e259470cf2665`

Credential content was preserved exactly.

## Runtime hygiene action

Before implementation, a dry-run identified 285 terminal managed sessions older than 24 hours. After user confirmed other work was stopped, LConnect pruned exactly those 285 terminal registry entries. Running sessions were not terminated and no user files were deleted.

## Closure

LCN-057 is **COMPLETE / DEPLOYED / LIVE GREEN**.

Next planned task: LCN-058 — optional Windows AtLogOn persistence. It must remain opt-in, removable, idempotent, DPAPI CurrentUser-compatible and must not expose credentials on command lines.
