# LCN-047 — Turn-Risk Telemetry Model Repair

Status: **ACTIVE**

Date: 2026-09-27

## Problem

LCN-046 proved that explicit round boundaries and user-confirmed Retry capture work, but its adaptive ceiling model used the wrong measurement as the causal budget.

Real failed round 6 evidence:

- explicit round start: 2026-09-27T14:20:56.077Z
- user-confirmed Retry / SetMax: 2026-09-27T14:30:20.050Z
- observed round wall-clock: 563,973 ms
- completed work-tool handler sum: 36,899.003 ms
- handler share of wall-clock: about 6.54%
- unmeasured/non-handler wall time: about 527,074 ms
- work-tool calls: 14
- LConnect tool timeouts in that round: 0
- largest handler: about 6,922.6 ms
- largest observed inter-call gap: about 47,441 ms

Therefore `sum(handler_elapsed_ms)` is not end-to-end round duration and must not be treated as a Retry deadline.

## Goal

Replace the speculative adaptive latency ceiling with an observation-only, round-scoped turn-risk telemetry model that records what LConnect can actually observe without claiming causal knowledge of the ChatGPT/platform Retry.

## Design rules

1. Preserve explicit round boundaries. Previous-round data must never be accumulated into a new round.
2. `latency_round_start` remains the AI-owned boundary before LConnect work in a new user turn when round telemetry is wanted.
3. Keep the current 122-tool MCP catalog; do not add a schema-refresh dependency for this repair.
4. Keep `latency_budget_status` as a compatibility tool name, but report the measurement model as observation-only turn-risk telemetry.
5. Disable automatic ENFORCE behavior. No tool may be blocked from a handler-sum-derived prediction.
6. `SetMaxLatency-LConnect.cmd` becomes a compatibility alias for user-confirmed Retry snapshot capture; it must not create a ceiling.
7. Add `ConfirmRetry-LConnect.cmd` as the preferred user-facing name.
8. Historical Retry snapshots are audit evidence only and must not create an active budget.
9. Do not infer a Retry from request ID, idle time, result size, or any single metric.

## Round metrics

Track separately:

- observed round wall-clock from explicit round start
- completed handler sum
- last/max handler duration
- call count
- first/last call timestamps
- observed idle/inter-call time
- maximum observed idle gap
- in-flight call count at snapshot
- overlapping call-start count
- total/max result bytes
- error count
- local tool-timeout count
- unattributed wall time = max(0, wall-clock - completed handler sum)
- handler share percentage

The wall clock is an **LConnect round clock**, not proof of the full ChatGPT turn lifetime because LConnect cannot observe the user-message arrival time or platform-internal reasoning/delivery phases.

## Retry confirmation behavior

When the user observes a real Retry and runs `ConfirmRetry-LConnect.cmd` or legacy `SetMaxLatency-LConnect.cmd`:

- snapshot only the current round
- mark it `confirmed_retry`
- record the snapshot in audit history
- keep mode OBSERVE
- keep enforcement disabled
- do not calculate failure ceiling / average-call budget / safe max / predicted next call
- preserve the latest confirmed Retry snapshot for comparison with future failed rounds

## Compatibility

Keep:

- `ResetRound-LConnect.cmd`
- `SetMaxLatency-LConnect.cmd` as compatibility alias
- `ResetMaxLatency-LConnect.cmd` as compatibility reset
- `StatusMaxLatency-LConnect.cmd` as compatibility status
- `latency_round_start`
- `latency_budget_status`
- `structuredContent.latency_budget` metadata key

Add preferred aliases:

- `ConfirmRetry-LConnect.cmd`
- `StatusTurnRisk-LConnect.cmd`

## Acceptance

- old handler-sum enforcement is disabled: PASS (source/local)
- old persisted ENFORCE/active state normalizes safely to clean OBSERVE without carrying incomplete v1 telemetry: PASS (corrective targeted regression)
- new round starts all metrics at zero: PASS
- previous round does not carry into next round: PASS
- wall-clock and handler-sum are reported separately: PASS
- idle/inter-call gaps are measured separately: PASS
- result-byte metrics are captured: PASS
- error/timeout counts are captured: PASS
- user-confirmed Retry creates an observation snapshot only: PASS
- Retry confirmation does not enable blocking: PASS
- second confirmed Retry replaces latest snapshot without combining history: PASS
- compatibility wrappers remain functional: PASS
- preferred ConfirmRetry/StatusTurnRisk wrappers exist: PASS
- targeted smoke: PASS
- `npm run check`: PASS
- primary full `npm test`: PASS (54.344 s)
- live-found migration corrective full `npm test`: PASS (52.178 s)
- dependency audit: PASS (0 vulnerabilities)
- `git diff --check`: PASS
- source↔installed deployment parity: PENDING
- live runtime validation: PENDING
