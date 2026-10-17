# LCN-062 — Context Efficiency & Conditional Read Cache — Closure Report

Date: 2026-10-17

Status: **COMPLETE / DEPLOYED / RUNTIME GREEN — CHATGPT SCHEMA REFRESH REQUIRED FOR NEW INPUT FIELDS**

## Goal

Reduce repeated LConnect MCP result payloads that consume model context during long ChatGPT/Codex workflows without adding stale-by-default reads, retaining result content in cache, expanding the public tool surface, or weakening existing mutation boundaries.

## Authoritative baseline

At activation:

- repository: `funggier/LConnect`
- branch: `main`
- activation HEAD: `da542573914373671cdde3412a593bbd0564fd7a`
- source/runtime version: `1.3.1`
- live runtime: PID `26252`
- public MCP tools: `154`
- catalog digest: `2ca33225b970dd70e1350d7b4e3d9290116448181031872d643111ae7ab4c374`
- worktree: clean, local `main == origin/main`
- published `v1.3.1`, `v1.3.0` and `v1.2.2` release/tag evidence remained untouched

Live telemetry showed repeated large read-only result volume, especially from file reads, multi-file reads, structured search and repeated status observation. The task therefore targets duplicate result/context delivery rather than claiming that generic prompt caching alone directly maps to Codex quota savings.

## Delivered design

The existing `batch_inspect` tool was extended; no new public MCP tool was added.

Every successful operation can now report:

- `result_digest_sha256`
- `not_modified`
- `result_suppressed`
- `cache_hit`
- `execution_skipped`
- `cache_age_ms`

Callers may supply a previous `result_digest_sha256` as `known_digest`.

### Freshness-first default

`cache_max_age_ms = 0` remains the default:

1. execute the underlying allowlisted read-only inspection,
2. compute SHA-256 for the fresh result,
3. when the digest matches `known_digest`, return compact `not_modified` evidence and omit duplicate `result_text`,
4. when the digest differs, return the changed bounded result normally.

This reduces repeated model-context payload while preserving fresh-state semantics by default.

### Optional bounded execution cache

A caller can explicitly set `cache_max_age_ms` up to 300000 ms.

When the cache key for the same tool + canonicalized arguments has a fresh metadata entry and its digest equals `known_digest`, LConnect can:

- set `cache_hit: true`,
- set `execution_skipped: true`,
- return compact not-modified evidence,
- skip the underlying read-only execution.

The cache is bounded to 256 entries and stores only:

- SHA-256 digest,
- result byte/character size,
- checked-at timestamp.

It does **not** retain result bodies, file contents, command text or arguments. Error results are not cached.

## Safety boundary

Preserved from the original `batch_inspect` contract:

- explicit local read-only allowlist only
- no shell execution
- no process/service/scheduled-task mutation
- no Git mutation
- no network-backed GitHub calls
- no nested batch/planner/loop
- no persistent cache file
- no stale read unless a caller explicitly chooses a positive TTL

Public MCP catalog remains exactly **154 tools**.

## Implementation evidence

Implementation commit:

`4b9f6beeeb12351f42bf44de1362bd2543024f5e`

Commit message:

`LCN-062 add conditional read cache`

### Local qualification

PASS:

- new conditional-cache targeted smoke
- initial digest generation
- digest-only positive-TTL short circuit
- unchanged fresh revalidation suppression
- changed-content invalidation
- no-result-content-retention contract
- existing `batch_inspect` regression
- syntax check: 86 files
- full test runner: 41 Node suites + 2 PowerShell suites
- source tool-surface guard: 154 tools
- duplicate public tool names: none
- `npm audit --audit-level=high`: 0 vulnerabilities
- `git diff --check`

### Exact-commit CI

- workflow: `LConnect CI`
- run number: **#189**
- run ID: `39020912202`
- exact head SHA: `4b9f6beeeb12351f42bf44de1362bd2543024f5e`
- Windows job: SUCCESS
- Runtime smoke tests: SUCCESS
- Dependency audit: SUCCESS
- overall result: **SUCCESS**

## Production deployment

Deployment used a tracked-only copy driven by `git ls-files`.

- copied Git-tracked files: **267**
- broad mirror delete: **not used**
- source HEAD deployed: `4b9f6beeeb12351f42bf44de1362bd2543024f5e`
- preserved local paths: 6/6 present
- encrypted credential was not overwritten

Pre-restart source/install parity:

- tracked files: **267/267 exact**
- source manifest digest:
  `b2809f5fcb6ea108864810730c3edbd2c7107c45942ca4d70017116ec7eee9ee`
- installed manifest digest:
  `b2809f5fcb6ea108864810730c3edbd2c7107c45942ca4d70017116ec7eee9ee`

Encrypted credential SHA-256 before and after tracked deployment:

`b773cace3931586913b84460c4b00cbd1ce33b78a165fa77355e259470cf2665`

## Runtime activation

Secure detached restart was initiated through the existing DPAPI-backed restart path.

Runtime transition:

- old PID: `26252`
- new PID: `30876`
- version: `1.3.1`
- tools: `154`
- catalog digest:
  `2ca33225b970dd70e1350d7b4e3d9290116448181031872d643111ae7ab4c374`
- duplicate public tool names: none
- working directory: installed runtime root

The restarted daemon returned the new result contract from `batch_inspect`, including `result_digest_sha256`, `conditional_cache`, `not_modified`, `cache_hit` and `execution_skipped`, proving the new production module was loaded.

Installed-tree physical qualification then ran the new targeted cache smoke against a fresh MCP process from the deployed tree and passed all five cache behaviors.

Post-restart deployment verification:

- source/install tracked parity: **267/267 exact**
- direct dependencies: all present
- preserved local paths: 6/6 present
- runtime: **1.3.1 / PID 30876 / 154 tools**
- duplicate tool names: none
- encrypted credential SHA-256 unchanged

## ChatGPT client schema boundary

The ChatGPT-side LConnect tool schema visible in the conversation that performed this deployment was loaded before LCN-062 changed the `batch_inspect` input schema.

Therefore:

- the live daemon already runs the new implementation,
- old-compatible `batch_inspect` calls already return the new output fields,
- the installed-tree smoke proves `known_digest` and `cache_max_age_ms` work in the deployed production bits,
- but that already-open ChatGPT conversation rejects the new input fields locally before dispatch because its cached connector schema is stale.

This is a client schema-refresh boundary, not a runtime failure. Refreshing/reloading the LConnect connector/plugin exposes the updated input schema to a new/current ChatGPT tool catalog.

## Result

LCN-062 is complete at the implementation/runtime boundary.

The feature directly reduces duplicate MCP result payload/context and can also avoid repeated read-only execution when a positive TTL is explicitly selected. It does **not** claim or guarantee a fixed percentage reduction in ChatGPT/Codex plan quota because quota accounting is controlled outside LConnect.

Published release/tag evidence was not changed.
