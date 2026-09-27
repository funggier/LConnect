# LCN 2026-09-27 — LCN-046 User-Confirmed Adaptive Turn Latency Budget

## Status

**COMPLETE — DIRECT CHATGPT TOOL VALIDATION PASS**

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

### Live null-normalization defect

After first live deployment, `runtime_catalog` correctly reported 122 tools but latency metadata in OBSERVE mode showed uncalibrated ceiling/safe/predicted values as `0` instead of `null`.

Root cause:

- generic numeric normalization called `Number(null)`, which produces `0`

Repair:

- null/undefined/empty values now preserve the configured fallback before numeric conversion
- targeted regression asserts uncalibrated failure ceiling, average, safe max, prediction and remaining budget are all `null`
- latency smoke repeated after repair: PASS
- post-live null-fix full `npm test`: PASS (~52.5s)
- post-live null-fix dependency audit: 0 vulnerabilities
- post-live null-fix `git diff --check`: PASS

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

## Exact commits / CI

- implementation commit: `df66e72ba28f70ef0ed595c3be70bb9863ee5679`
- implementation CI: run `36318144473` / #123 — PASS
- corrective null-semantics commit: `500b7cb0cad669b087cf8242e5f84d114af2e5fd`
- corrective CI: run `36318612471` / #124 — PASS
- live-checkpoint CI: run `36318986517` / #125 — PASS
- full-handoff commit: `1d592cfd4a51dd0bb4ea391df304409f75c9459b`
- full-handoff CI: run `36320528918` / #126 — PASS

## Installed live validation

- tracked source↔installed before closure edits: `188/188` equal
- pre-closure source/install manifest digest: `687693bc4cfceaa1908fdff09db3f08dddb7ef8359c9de9bae5fca5592259a85`
- package version parity: PASS (`1.2.0`)
- dependency declarations/presence: PASS (4/4)
- preserved local paths: PASS (`mcp-conf.yaml`, `node_modules`, `logs`, `runtime`)
- running runtime: `1.2.0 / 122 tools`
- runtime PID at direct validation: `17236`
- runtime catalog digest: `4a8ef91a83938d4e835a7716c90c8784235708bdf31c5cb763b1d2911fecc525`
- expected tool-count match: PASS
- live OBSERVE metadata null semantics: PASS
- direct pre-start `latency_budget_status`: PASS — OBSERVE / generation 1 / round 1 / not_started / 0 calls / 0 ms / no ceiling / unbounded remaining
- direct `latency_round_start`: PASS — advanced to round 2 / active with `calls_this_round=0` and `current_round_ms=0`
- direct post-start `latency_budget_status`: PASS — round 2 / active / `call_count=0` / `cumulative_latency_ms=0` / `max_call_ms=0`
- previous-round latency carry-over into the new round: NONE
- no synthetic `SetMaxLatency` calibration was performed

## Final direct ChatGPT validation

After reconnect, ChatGPT exposed the complete **122-tool** LConnect catalog, including both new direct tools:

- `latency_budget_status`
- `latency_round_start`

The initial direct status remained uncalibrated OBSERVE with round 1 not started and zero active-round latency. `latency_round_start` then created round 2 and returned zero counters before any subsequent work tool ran. A direct status call immediately afterward confirmed the same zero-start state. This closes the remaining client-schema validation gap and proves that a new round does not inherit previous-round latency.

## Closure

Post-closure docs sync verification:

- tracked source↔installed: `188/188` equal
- missing installed: `0`
- changed: `0`
- runtime remains `1.2.0 / 122 tools`
- preserved `mcp-conf.yaml`, `node_modules`, `logs`, and `runtime`: PASS

LCN-046 is COMPLETE at the current need. Real calibration remains intentionally external to task closure: the user should run `ResetRound-LConnect.cmd` before a deliberate measurement round and run `SetMaxLatency-LConnect.cmd` only after an actual user-observed Retry/message-delivery failure. Historical rounds remain audit-only.