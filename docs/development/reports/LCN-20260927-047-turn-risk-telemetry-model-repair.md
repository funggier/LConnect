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

## Live activation findings

Initial LCN-047 activation loaded schema v2 successfully, but exposed one migration defect in legacy active-round state:

- the v1 round had an old `started_at` and handler counters
- v1 did not have the v2 call timestamp/result-byte fields
- preserving that active round caused the first v2 work call to interpret the entire pre-upgrade interval as one observed idle gap
- this produced a bogus ~19 minute idle measurement in migrated round 11

Corrective rule:

- schema v1 round measurements are audit-only
- when migrating v1 -> v2, preserve the round ID for sequence continuity but reset the current round to `not_started` with zero v2 metrics
- record the legacy round inside the migration history event rather than interpreting incomplete telemetry as v2 observations
- the live runtime was manually moved to clean round 12 at zero immediately after the artifact was identified

Targeted regression for legacy `ENFORCE + active round`: PASS.

Corrective local validation:

- targeted migration smoke: PASS
- `npm run check`: PASS
- full `npm test`: PASS (52.178 s)
- dependency audit: PASS — 0 vulnerabilities
- `git diff --check`: PASS

## Activation incident

The first activation attempt killed only the MCP child PID under `tunnel-client.exe`, assuming the tunnel supervisor would respawn it. Live evidence disproved that assumption: the tunnel client exited with the child and LConnect went offline.

Recovery used the established `Start-LConnect.ps1` path from the independent BConnect control channel. Existing control-plane credentials were inherited from environment variables without reading, printing, or persisting their values. Doctor PASS and LConnect recovered successfully.

Operational correction: do not activate LConnect by killing only `node lconnect-mcp.mjs`. Use the established Stop/Start flow from an independent control channel when a runtime restart is required.

## Implementation / CI evidence

- primary implementation commit: `70bfa9412d13a1f1e9a77c1a5b870ba3c84622d2`
- GitHub CI #128 / run `36328927478`: PASS
- primary installed sync before activation: `192/192` tracked equal
- primary source/install manifest digest: `7d177f709ab459ccbc64dc5ba275bba65014f0f629bec990708bd1fdbf69d0f8`
- first v2 runtime after recovery: PID `27788`, version `1.2.0`, 122 tools, catalog digest unchanged
- direct `latency_budget_status`: PASS — `turn_risk_observation_v2 / OBSERVE / enforcement disabled`
- clean live round 12 start: PASS — all counters zero at boundary

## Pending

- corrective commit + CI
- corrective installed sync
- controlled Stop/Start activation through BConnect
- final live direct-tool validation
- final source↔installed parity
