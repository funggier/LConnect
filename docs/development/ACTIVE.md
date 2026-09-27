# ACTIVE — LConnect Development

Last updated: 2026-09-27

## Current state

- Repository: `funggier/LConnect`
- Branch: `main`
- Latest published release: **v1.2.0 — Reliability & Verification** (120 tools)
- Source version: `1.2.0`
- Current source candidate catalog: **122 tools**
- Installed/running daemon: **1.2.0 / 122 tools**
- Running catalog digest: `4a8ef91a83938d4e835a7716c90c8784235708bdf31c5cb763b1d2911fecc525`
- ChatGPT-visible catalog after reconnect: **122 tools**
- LCN-046: COMPLETE — original round-boundary implementation; handler-sum enforcement superseded by LCN-047 evidence
- LCN-047: COMPLETE — Turn-Risk Telemetry Model Repair / observation-only live GREEN
- LCN-048: COMPLETE — Retry Tail-Gap Telemetry Refinement / live GREEN
- LCN-049: COMPLETE — Legacy MaxLatency compatibility surface removed / live GREEN
- LCN-018–023: DEFERRED — Desktop Control / Browser Automation

## Active task

No active development task.

Latest completed task: [LCN-049 — Remove Legacy MaxLatency Compatibility Surface](tasks/LCN-049-remove-legacy-maxlatency-compatibility-surface.md)

Final report: [reports/LCN-20260927-049-remove-legacy-maxlatency-compatibility-surface.md](reports/LCN-20260927-049-remove-legacy-maxlatency-compatibility-surface.md)

Final report: [reports/LCN-20260927-048-retry-tail-gap-telemetry-refinement.md](reports/LCN-20260927-048-retry-tail-gap-telemetry-refinement.md)

Current reliability state:

- runtime: **1.2.0 / 122 tools**
- runtime PID after controlled restart: `36936`
- measurement model: `turn_risk_observation_v2`
- mode: **OBSERVE**
- enforcement: **disabled**
- `tail_idle_ms`: live
- `max_observed_gap_ms`: live
- pre-LCN-048 Retry snapshots preserve unknown tail fields as null/none
- fresh live round 15 started at zero: PASS
- primary CI #131: PASS
- corrective CI #132: PASS
- source↔installed before docs-only closure: **194/194 equal**
- no synthetic Retry snapshot used for closure

## Next action

Complete LCN-049 cleanup, then use `ConfirmRetry-LConnect.cmd` as the sole Retry-confirmation command. Keep `ResetRound-LConnect.cmd` and `StatusTurnRisk-LConnect.cmd` only for their separate round/status roles.