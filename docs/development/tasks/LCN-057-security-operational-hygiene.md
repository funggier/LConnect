# LCN-057 — Security & Operational Hygiene

Status: **COMPLETE / DEPLOYED / LIVE GREEN**

Activated: 2026-10-08

## Goal

Harden the post-v1.3.0 LConnect runtime without changing the immutable v1.3.0/v1.2.2 release evidence.

## Authoritative baseline

- repository: `funggier/LConnect`
- branch: `main`
- activation HEAD: `c4472cf8a85deb74ecf94681474b6b9bb3c2a378`
- source/install tracked parity: 248/248 exact
- package/runtime: 1.3.0
- runtime catalog: 154 tools, duplicate public names none
- runtime PID observed at activation: 11448
- tunnel PID observed at activation: 11852
- full local test suite: PASS (39 Node suites + 1 PowerShell suite)
- syntax check: PASS (84 files)

## Triggering findings

1. Current npm advisories now report:
   - CRITICAL: `proxy-addr <2.0.8`
   - HIGH: `@modelcontextprotocol/sdk <1.31.0`
2. `npm audit fix --dry-run` shows a bounded fix:
   - `proxy-addr 2.0.7 -> 2.0.8`
   - `@modelcontextprotocol/sdk 1.30.0 -> 1.32.1`
3. Managed terminal sessions accumulate across long runtimes; 285 terminal sessions older than 24h were prune-eligible during activation audit.
4. `search_files` can recursively walk very large trees with only a match-count bound; observed handler time exceeded 100 seconds in real use.
5. Tool telemetry keeps a bounded raw ring, but aggregate evidence is lost as raw events roll out.
6. `start_process` on Windows does not match `command_run` ergonomics for .cmd/.bat launchers and can return `spawn EINVAL`.
7. Turn-risk observation rounds can remain active for days and thousands of calls, reducing the usefulness of current-round evidence.
8. Current development docs can present qualification PIDs as if they were permanently current.

## Scope

### A. Dependency security

- update MCP TypeScript SDK to a patched compatible release
- refresh transitive lockfile so proxy-addr is patched
- do not take unrelated major upgrades
- require zero high/critical vulnerabilities before closure

### B. search_files containment

Add hard traversal/time/depth bounds while preserving the existing public tool name and basic result format.

### C. Managed-session hygiene

- add bounded filtering/pagination controls to `list_sessions`
- keep existing no-argument behavior compatible where practical
- add a registry high-water cleanup rule that never removes running sessions
- retain explicit `prune_sessions`

### D. Windows managed-process launcher consistency

Make `start_process` support explicit Windows .cmd/.bat launchers through a safely quoted PowerShell wrapper, while preserving the requested program/args in session evidence.

### E. Telemetry retention

Keep the raw event ring bounded and add lifetime metadata aggregates that survive raw-ring eviction for the current runtime. Clearing telemetry clears both raw and aggregate state.

### F. Turn-risk round hygiene

Introduce an observation-only idle rollover boundary. It must never block work and must preserve previous-round evidence in history.

### G. Documentation truthfulness

Treat process IDs as qualification observations, not immutable current facts. Live state remains authoritative through runtime/status tools.

## Non-goals

- no movement or overwrite of v1.3.0/v1.2.2 tags/releases
- no force push
- no worktree reset/clean
- no autonomous workflow engine
- no change from one main MCP channel
- no automatic enforcement from latency telemetry
- no automatic Windows logon/startup persistence in this task; that is reserved for LCN-058

## Qualification

Required before closure:

- npm run check
- full npm test
- npm audit --audit-level=high => zero high/critical
- targeted new regression tests
- git diff --check
- exact-commit GitHub CI
- tracked-only deployment preserving local state
- secure detached restart
- runtime 1.3.0 / expected catalog / no duplicate tool names
- source/install exact parity
- live smoke for changed behavior

## Closure evidence

- implementation commit: `c949c3239cc5ede9e285dfd605b0e62392bdde4b`
- exact-commit CI: #175 / run `37810517540` — SUCCESS
- local full qualification: 39 Node + 1 PowerShell suites PASS
- dependency audit: 0 vulnerabilities
- deployed tracked parity: 249/249 exact
- live runtime: 1.3.0 / 154 tools / PID 15508
- live tunnel PID observed: 17752
- encrypted credential hash preserved exactly
- report: `../reports/LCN-20261008-057-security-operational-hygiene.md`
