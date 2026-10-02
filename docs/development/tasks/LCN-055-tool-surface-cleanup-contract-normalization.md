# LCN-055 — Tool Surface Cleanup & Contract Normalization

Status: **COMPLETE / DEPLOYED / LIVE GREEN**

## Goal

Normalize the mature LConnect public tool surface without reducing capability: make canonical vs compatibility APIs explicit, add deterministic catalog accounting, improve test maintainability and filesystem regression coverage, document parameter/result conventions and browser safety boundaries, and eliminate current-facing documentation drift.

## Baseline

- branch: `main`
- activation HEAD / exact `origin/main`: `b96343ed4e3118ed45a24490cac89a11dc86db19`
- activation worktree: CLEAN
- source/installed tracked parity: 237/237 exact
- runtime: `1.2.2`, PID `12736`
- runtime catalog: 154 tools
- catalog digest: `2ca33225b970dd70e1350d7b4e3d9290116448181031872d643111ae7ab4c374`
- published release: immutable `v1.2.2` / 122-tool release baseline

## Motivation

The catalog is now large enough that clarity and evolution safety matter more than adding capability. Known issues include compatibility aliases without a central policy, uneven result/error conventions across generations, stale current-facing documentation, long package.json test chains, weak direct filesystem regression coverage, and non-deterministic source-registration accounting.

## Scope

1. Create deterministic source catalog accounting and duplicate-name checks.
2. Classify public tools as canonical / compatibility / deprecated, with replacement metadata where applicable.
3. Establish safety/family/platform/long-running metadata sufficient for audit and generated index use.
4. Preserve compatibility; do not remove public tools solely for cosmetic cleanup.
5. Add direct filesystem smoke coverage, including Unicode/Thai, aliases, moves, tree/list/search/metadata, guards and failures.
6. Replace fragile hand-maintained npm check/test command chains with deterministic runner manifests/scripts while preserving semantics.
7. Add CI guards for catalog count, duplicate names, metadata completeness and current-facing docs count.
8. Document canonical process path, parameter naming conventions, result/error conventions and managed-vs-live browser selection.
9. Repair current documentation drift without rewriting historical reports.
10. Qualify locally, exact-commit CI, deploy tracked source only, restart if runtime code changes, and prove live/source/install parity.

## Non-goals

- no MCP channel expansion
- no speculative timeout/retry redesign
- no mass output-contract rewrite that breaks compatibility
- no broad tool renames without migration benefit
- no v1.2.2 tag/release mutation
- no normal Firefox/Chrome profile mutation
- no worktree reset or force push

## Compatibility rules

- `read_text_file` is canonical; `read_file` is a deprecated compatibility alias.
- `read_process_events` is the modern cursor output path; `read_process_output` remains supported compatibility surface.
- Legacy output shapes remain unless a compatible metadata extension is safe.
- Renames require explicit replacement/transition metadata rather than silent deletion.

## Acceptance criteria

- source expected catalog deterministically equals 154-tool public runtime catalog before any intentional catalog change
- no duplicate public tool names
- every public tool has classification/family/safety metadata
- compatibility/deprecated entries identify a canonical replacement where applicable
- filesystem dedicated smoke suite passes
- package check/test runner remains deterministic and complete
- current-facing docs state main/runtime=154 and release=122 until a later release task changes that truth
- `npm run check`, targeted tests, full `npm test`, `npm audit --audit-level=high`, and `git diff --check` pass
- exact implementation commit CI passes before deployment
- tracked-only deployment preserves local-only state and encrypted credentials
- live runtime catalog/source/install parity passes after restart
- closure report records exact SHA, CI, deployment and runtime evidence
