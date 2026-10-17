# LCN-062 — Context Efficiency & Conditional Read Cache

Status: **COMPLETE / DEPLOYED / RUNTIME GREEN — CHATGPT SCHEMA REFRESH REQUIRED FOR NEW INPUT FIELDS**

Activated: 2026-10-17

## Goal

Reduce repeated MCP result payloads that consume model context during long LConnect/Codex work without introducing stale-by-default reads, storing result content, or changing the existing public tool count.

## Authoritative activation baseline

- repository: `funggier/LConnect`
- branch: `main`
- activation HEAD: `da542573914373671cdde3412a593bbd0564fd7a`
- worktree: clean; local `main == origin/main`
- source version: 1.3.1
- live runtime: 1.3.1 / 154 tools / PID 26252 at activation
- live catalog digest: `2ca33225b970dd70e1350d7b4e3d9290116448181031872d643111ae7ab4c374`
- published v1.3.1 remains immutable

## Evidence driving the task

Runtime telemetry shows repeated large read-only payloads. Examples from the live process include:

- `read_text_file`: multi-megabyte cumulative result volume
- `read_multiple_files`: multi-megabyte cumulative result volume
- `search_text`: large repeated search payloads
- `session_status` / process observation: repeated status payloads during long workflows

Caching execution alone would not reduce model context if the same full result were returned again. The implementation therefore combines content digests, conditional not-modified semantics and an optional short-circuit cache.

## Design

Extend the existing `batch_inspect` tool instead of adding another public tool.

Each successful result returns:

- `result_digest_sha256`
- `not_modified`
- `result_suppressed`
- `cache_hit`
- `execution_skipped`
- `cache_age_ms`

A caller may return the previous `result_digest_sha256` as `known_digest`.

Default behavior remains freshness-first:

- `cache_max_age_ms = 0` means execute the underlying read-only tool again
- if the fresh digest is unchanged, omit duplicate `result_text`
- if changed, return the new bounded result normally

Optional bounded cache behavior:

- a caller may set `cache_max_age_ms` up to 300000 ms
- if a matching digest-only cache entry is fresh and equals `known_digest`, skip the underlying execution and return compact not-modified evidence
- cache stores digest/size/timestamp metadata only
- result content is never retained by this cache
- maximum cache entries: 256
- errors are never cached

## Safety

- preserve the existing explicit read-only allowlist
- no shell/process/Git mutation is admitted through `batch_inspect`
- no network-backed GitHub tools are admitted
- no persistent cache files
- no file contents, command text, arguments or result bodies stored in the digest cache
- no stale read unless the caller explicitly supplies a positive `cache_max_age_ms`
- no public tool-count increase

## Local qualification evidence

- targeted conditional-cache smoke: PASS
- existing `batch_inspect` regression: PASS
- syntax: PASS — 86 files
- full suite: PASS — 41 Node suites + 2 PowerShell suites
- source catalog guard: PASS — 154 tools, duplicate names none
- dependency audit: PASS — 0 vulnerabilities
- `git diff --check`: PASS

## Qualification result

- targeted conditional-cache smoke: **PASS**
- unchanged-result fresh revalidation suppression: **PASS**
- positive-TTL execution short circuit: **PASS**
- changed-result invalidation: **PASS**
- direct-tool compatibility and existing `batch_inspect` regression: **PASS**
- `npm run check`: **PASS — 86 files**
- full `npm test`: **PASS — 41 Node + 2 PowerShell suites**
- `npm audit --audit-level=high`: **PASS — 0 vulnerabilities**
- `git diff --check`: **PASS**
- implementation commit: `4b9f6beeeb12351f42bf44de1362bd2543024f5e`
- exact-commit GitHub CI: **#189 / run 39020912202 — SUCCESS**
- tracked-only deployment: **PASS — 267 files; no mirror delete**
- secure runtime restart: **PASS — PID 26252 → 30876**
- live runtime: **1.3.1 / 154 tools / duplicate names none**
- installed-tree conditional-cache physical smoke: **PASS**
- source/install parity after activation: **267/267 exact**
- local encrypted credential hash: **preserved**

The restarted daemon emits the new result contract. The ChatGPT conversation used during qualification still holds the pre-LCN-062 input schema, so a connector/plugin schema refresh is required before that client can send `known_digest` or `cache_max_age_ms`. This does not block the deployed runtime implementation.

Closure report: [LCN-20261017-062-context-efficiency-conditional-read-cache.md](../reports/LCN-20261017-062-context-efficiency-conditional-read-cache.md)
