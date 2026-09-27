# LCN-046 — User-Confirmed Adaptive Turn Latency Budget

Status: **ACTIVE — LIVE GREEN / CHATGPT DIRECT-TOOL REFRESH VALIDATION PENDING**

Local gate: `npm test` PASS (`tools=122`, ~52.5s), dependency audit 0 vulnerabilities, `git diff --check` PASS.

Live gate: corrective commit `500b7cb0cad669b087cf8242e5f84d114af2e5fd`, CI #124 PASS, source↔installed 187/187, runtime `1.2.0 / 122 tools`, CLI state `OBSERVE / round 0 / not_started`, uncalibrated ceiling/safe/prediction/remaining preserved as null.

## Goal

Reduce repeat/retry risk by keeping a per-round local tool-latency budget that is calibrated only when the user explicitly confirms a retry with `SetMaxLatency-LConnect.cmd`.

## Hard invariants

1. Latency is **round-scoped**. Previous rounds MUST NOT be added to the current round.
2. `SetMaxLatency-LConnect.cmd` uses **only the current/latest round**. Historical rounds are audit-only.
3. A new Set operation **replaces** the active ceiling; it does not average/min/EWMA against older failures.
4. The active safe budget is calculated from the confirmed failed round only:
   - `average_call_ms = failed_round_total_ms / failed_round_call_count`
   - `safe_max_ms = failed_round_total_ms - average_call_ms`
5. Before calibration, mode is `OBSERVE`; no hard latency-budget block occurs.
6. After calibration, mode is `ENFORCE`.
7. After a confirmed retry, the failed round is closed. The next round must start from zero.
8. History may be retained for evidence but MUST NOT participate in active-budget calculations.

## Round lifecycle

### Calibration / manual override

- Run `ResetRound-LConnect.cmd` before a deliberate measurement round.
- LConnect starts a new round with call count and cumulative latency = 0.
- If the round produces a ChatGPT Retry/message-delivery failure, run `SetMaxLatency-LConnect.cmd` before starting another round.
- SetMaxLatency marks only that round as the confirmed failure and calculates the active safe budget.

### Normal use after a max is known

- The AI calls `latency_round_start` before the first LConnect work tool of each new user turn.
- `latency_round_start` starts a fresh round at zero without changing the learned max.
- The user does not need to run `ResetRound-LConnect.cmd` for normal turns.

Because current connector telemetry exposes MCP `request_id="0"` for all calls and no reliable ChatGPT turn identifier, round boundaries MUST NOT be inferred from request ID or idle-time heuristics.

## Runtime state

Local-only files under ignored `runtime/`:

- `runtime/latency-budget-state.json` — current authoritative state
- `runtime/latency-budget-history.jsonl` — audit-only events/round snapshots

External CMD/PowerShell controls and the running daemon share the same state file. The daemon reloads persisted state at tool boundaries so manual commands take effect without a restart.

## Controls

- `ResetRound-LConnect.cmd` — start a new round at zero; preserve active max.
- `SetMaxLatency-LConnect.cmd` — confirm retry for current round and replace active ceiling/safe max.
- `ResetMaxLatency-LConnect.cmd` — clear active ceiling and return to OBSERVE mode.
- `StatusMaxLatency-LConnect.cmd` — show current round and active budget.

## MCP tools

- `latency_round_start` — AI-owned automatic new-round boundary.
- `latency_budget_status` — structured state/evidence read.

## Guard behavior

When mode is ENFORCE and a round is active, preflight uses the failed-round average call latency as the next-call prediction.

If:

`current_round_ms + predicted_call_ms > safe_max_ms`

the work tool is not executed and returns structured `LATENCY_BUDGET_EXCEEDED` evidence.

If ENFORCE is active but no round is active, work tools return `ROUND_NOT_STARTED`, instructing the AI to call `latency_round_start`.

## Tool response metadata

Every wrapped work-tool result receives compact `latency_budget` metadata including:

- round ID/status
- call latency
- calls this round
- cumulative current-round latency
- confirmed failure ceiling
- safe max
- predicted next-call latency
- remaining budget
- mode/generation

## Acceptance

- explicit round reset starts at zero: PASS
- previous round latency never enters new round: PASS
- SetMaxLatency uses current round only: PASS
- second Set replaces, not combines with, first ceiling: PASS
- safe-max formula exactly follows failed-round total minus failed-round average call: PASS
- history is audit-only: PASS
- no hard block before user-confirmed max: PASS
- ENFORCE rejects work when no round started: PASS
- ENFORCE blocks predicted over-budget call before handler execution: PASS
- every successful/error tool result receives compact latency metadata: PASS
- external CMD state changes are visible without daemon restart: PASS
- source catalog increments from 120 to 122 tools: PASS
- full local suite: PASS
- GitHub CI: PASS
- installed live validation after restart/refresh: PASS