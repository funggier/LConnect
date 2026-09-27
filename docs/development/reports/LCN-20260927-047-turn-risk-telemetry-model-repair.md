# LCN 2026-09-27 — LCN-047 Turn-Risk Telemetry Model Repair

## Status

**ACTIVE — LOCAL GREEN / CI + LIVE DEPLOYMENT PENDING**

## Trigger

A real user-confirmed Retry invalidated the causal assumption behind the LCN-046 handler-sum adaptive ceiling.

Failed round 6 evidence:

- round start: `2026-09-27T14:20:56.077Z`
- Retry confirmation: `2026-09-27T14:30:20.050Z`
- observed explicit-round wall-clock: `563,973 ms`
- completed LConnect handler sum: `36,899.003 ms`
- handler share: approximately `6.54%`
- non-handler/unattributed wall time: approximately `527,074 ms`
- completed calls: `14`
- LConnect-local timed-out calls in the failed round: `0`
- largest completed handler: approximately `6,922.6 ms`
- largest observed inter-call gap from retained telemetry: approximately `47,441 ms`

Conclusion: completed handler time is a component measurement, not an end-to-end Retry deadline.

## Safety action

The live installed state was immediately reset from the invalid handler-sum ENFORCE budget back to OBSERVE before implementation work continued.

Observed after reset:

- mode: OBSERVE
- generation: 4
- failure ceiling: none
- safe max: none
- prediction: none
- remaining: unbounded

## Repair design

LCN-047 retains the useful explicit round boundary but changes the model to `turn_risk_observation_v2`.

The current MCP catalog remains 122 tools. Existing direct names remain:

- `latency_round_start`
- `latency_budget_status`

The compatibility metadata key remains `structuredContent.latency_budget`.

### No automatic enforcement

The new model is observation-only:

- mode is always OBSERVE
- enforcement is disabled
- handler-sum-derived failure ceiling is null
- safe max is null
- predicted next latency is null
- no `ROUND_NOT_STARTED` handler block
- no `LATENCY_BUDGET_EXCEEDED` handler block

### Separated measurements

Each explicit round tracks:

- round wall-clock from the explicit LConnect round boundary
- completed handler sum
- handler share of wall clock
- observed idle/inter-call time
- maximum idle gap
- unattributed wall time
- call count
- in-flight call count
- overlap-start count
- total/max result bytes
- error count
- local timeout count
- first/last call timestamps

The round wall clock is explicitly **not** claimed to be the complete ChatGPT turn lifetime. LConnect cannot observe user-message arrival or all platform-internal reasoning/delivery phases.

### Retry capture

Preferred command:

`ConfirmRetry-LConnect.cmd`

Legacy compatibility command:

`SetMaxLatency-LConnect.cmd`

Both now capture the current round as a user-confirmed Retry observation snapshot. They do not calculate or activate a latency ceiling.

Preferred status alias:

`StatusTurnRisk-LConnect.cmd`

Legacy `StatusMaxLatency-LConnect.cmd` remains compatible.

## Local evidence so far

- targeted `tests/latency-budget-smoke.mjs`: PASS
- observation-only/no handler-sum enforcement: PASS
- legacy ENFORCE state migrates to OBSERVE: PASS
- new-round zero reset: PASS
- previous-round carry-over: NONE
- wall-clock / handler sum separation: PASS
- observed idle gap capture: PASS
- result-byte capture: PASS
- error/timeout counters: PASS
- user-confirmed Retry observation snapshot: PASS
- Retry confirmation does not enable blocking: PASS
- latest Retry snapshot replacement without historical combination: PASS
- compatibility/preferred CMD wrappers use shared CLI: PASS
- history remains audit-only: PASS
- `npm run check`: PASS
- full `npm test`: PASS (54.344 s)
- dependency audit: PASS — 0 vulnerabilities
- `git diff --check`: PASS

## Pending

- source commit + CI
- installed sync
- daemon activation
- live state-schema migration validation
- live direct-tool validation
- final source↔installed parity
