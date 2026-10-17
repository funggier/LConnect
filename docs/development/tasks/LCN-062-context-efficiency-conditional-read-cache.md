# LCN-062 — Context Efficiency & Conditional Read Cache

Status: **ACTIVE**

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

## Qualification required

- targeted conditional-cache smoke test
- unchanged-result fresh revalidation suppression
- positive-TTL execution short circuit
- changed-result invalidation
- direct-tool compatibility and existing `batch_inspect` regression
- `npm run check`
- full `npm test`
- `npm audit --audit-level=high`
- `git diff --check`
- exact-commit GitHub CI
- tracked deployment preserving local secrets/state
- secure runtime restart
- live runtime remains 1.3.1 / 154 tools with no duplicate names
- physical live conditional-cache acceptance
- source/install parity
