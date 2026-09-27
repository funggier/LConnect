# LCN 2026-09-27 — LCN-046 User-Confirmed Adaptive Turn Latency Budget

## Status

**LOCAL GREEN — EXACT-COMMIT CI + INSTALLED LIVE VALIDATION PENDING**

## Goal

Add a user-confirmed, round-scoped latency guard that can learn a safe local tool budget from the exact round where the user observed ChatGPT Retry/message-delivery failure, without combining previous rounds or pretending LConnect can observe the platform timeout directly.

## Key contract

- Round latency is reset to zero at every explicit round boundary.
- Previous-round latency is never added to the current round.
- `SetMaxLatency-LConnect.cmd` uses only the current round.
- A later Set replaces the active ceiling; history is audit-only.
- Formula: `average_call_ms = failed_round_total_ms / failed_round_call_count`.
- Formula: `safe_max_ms = failed_round_total_ms - average_call_ms`.
- Before any confirmed failure the mode is OBSERVE and no hard budget block occurs.
- After SetMaxLatency the mode is ENFORCE.
- The AI starts each normal post-calibration user turn with `latency_round_start`.
- Request ID / idle-gap heuristics are not used. Live connector evidence showed MCP `request_id="0"` across calls.

## Added MCP tools

- `latency_round_start`
- `latency_budget_status`

Catalog: **120 → 122 tools** on current main candidate.

## Added user controls

- `ResetRound-LConnect.cmd`
- `SetMaxLatency-LConnect.cmd`
- `ResetMaxLatency-LConnect.cmd`
- `StatusMaxLatency-LConnect.cmd`

All four wrappers call the same Node controller implementation through `scripts/latency-budget-cli.mjs`.

## Runtime state

Local-only ignored state:

- `runtime/latency-budget-state.json` — active authoritative state
- `runtime/latency-budget-history.jsonl` — audit-only history

The daemon reloads state at work-tool boundaries, so CMD/CLI changes are observed without a daemon restart.

## Guard behavior

When ENFORCE is active:

- no active round → `ROUND_NOT_STARTED` before handler execution
- `current_round_ms + predicted_next_ms > safe_max_ms` → `LATENCY_BUDGET_EXCEEDED` before handler execution

`predicted_next_ms` is the average call latency of the latest user-confirmed failed round only.

Successful work-tool results preserve their original text payload and expose compact latency evidence through MCP `structuredContent.latency_budget` and `_meta.latency_budget`.

## Problems found and repaired

### Metadata text-content regression

Initial implementation appended latency metadata as a second text content item. `batch_inspect` intentionally concatenates text content to preserve nested tool results, causing two JSON documents to be concatenated and breaking JSON parsing.

Repair:

- latency metadata moved to `structuredContent` and MCP `_meta`
- original tool text payload remains unchanged
- blocked guard responses still return explicit structured error text
- `batch_inspect` targeted regression returned PASS

### Timing-dependent replacement test

Initial replacement test executed real delayed calls under an already-enforced budget. Scheduler variation could cause the guard to block those fixture calls, leaving no measured calls for the next SetMax.

Repair:

- replacement semantics now seed the second failed round deterministically
- latency smoke was run three concurrent times and all passed

## Local evidence

- `npm run check`: PASS
- latency-budget targeted smoke: PASS
- latency smoke repeated concurrently ×3: PASS
- batch-inspect regression: PASS
- source smoke: `PASS tools=122`
- full final `npm test`: PASS
- final suite elapsed: approximately 52.5 seconds
- dependency audit: 0 vulnerabilities
- `git diff --check`: PASS

Targeted acceptance:

- new round starts at zero: PASS
- previous round latency carry-over: NONE
- SetMax current-round-only: PASS
- exact safe-max formula: PASS
- later Set replaces prior ceiling: PASS
- OBSERVE → ENFORCE: PASS
- `ROUND_NOT_STARTED` pre-handler guard: PASS
- `LATENCY_BUDGET_EXCEEDED` pre-handler guard: PASS
- successful result latency metadata: PASS
- external CMD/CLI state reload without restart: PASS
- CMD wrappers share controller implementation: PASS
- audit-only history: PASS

## Pending

- candidate commit / push
- exact-commit GitHub CI PASS
- tracked deployment to installed tree
- installed syntax/smoke
- runtime restart and catalog 122 verification
- live state/control validation
- ChatGPT connector refresh for direct visibility of the two new tools