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
- LCN-047: ACTIVE — Turn-Risk Telemetry Model Repair
- LCN-018–023: DEFERRED — Desktop Control / Browser Automation

## Active task

### LCN-047 — Turn-Risk Telemetry Model Repair

Status: **ACTIVE**

Task: [tasks/LCN-047-turn-risk-telemetry-model-repair.md](tasks/LCN-047-turn-risk-telemetry-model-repair.md)

Root evidence: failed round 6 lasted ~563.973 s wall-clock while completed LConnect handler sum was only ~36.899 s (~6.54%). The adaptive ceiling derived from handler sum is therefore disabled pending a better evidence model.

LCN-046 final report remains historical evidence: [reports/LCN-20260927-046-user-confirmed-adaptive-turn-latency-budget.md](reports/LCN-20260927-046-user-confirmed-adaptive-turn-latency-budget.md)

Previous closure evidence:

- ChatGPT-visible LConnect catalog: **122 tools**
- `latency_budget_status` direct call: PASS
- `latency_round_start` direct call: PASS
- new round starts at `0 calls / 0 cumulative ms / 0 max ms`: PASS
- previous-round latency carry-over: none
- runtime: `1.2.0 / 122 tools`
- runtime catalog digest: `4a8ef91a83938d4e835a7716c90c8784235708bdf31c5cb763b1d2911fecc525`
- no synthetic MaxLatency calibration performed

## Next action

Implement and validate LCN-047 observation-only turn-risk telemetry, deploy it, and use future real Retry events as comparative evidence rather than as an automatic handler-sum ceiling.