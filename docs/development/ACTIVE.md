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
- ChatGPT-visible catalog before refresh: **120 tools**
- LCN-046: ACTIVE — User-Confirmed Adaptive Turn Latency Budget
- LCN-018–023: DEFERRED — Desktop Control / Browser Automation

## Active task

### LCN-046 — User-Confirmed Adaptive Turn Latency Budget

Status: **ACTIVE — LIVE GREEN / CHATGPT DIRECT-TOOL REFRESH VALIDATION PENDING**

Task: [tasks/LCN-046-user-confirmed-adaptive-turn-latency-budget.md](tasks/LCN-046-user-confirmed-adaptive-turn-latency-budget.md)

Report: [reports/LCN-20260927-046-user-confirmed-adaptive-turn-latency-budget.md](reports/LCN-20260927-046-user-confirmed-adaptive-turn-latency-budget.md)

Current targeted evidence:

- syntax: PASS
- latency-budget targeted smoke: PASS
- new round starts at zero: PASS
- previous-round latency carry-over: none
- SetMax current-round-only formula: PASS
- second SetMax replaces prior ceiling: PASS
- ROUND_NOT_STARTED pre-execution guard: PASS
- LATENCY_BUDGET_EXCEEDED pre-execution guard: PASS
- CMD/CLI shared state reload without daemon restart: PASS
- source smoke: `PASS tools=122`
- final full `npm test`: PASS (~52.5s)
- dependency audit: 0 vulnerabilities
- `git diff --check`: PASS

## Next action

Refresh the ChatGPT connector/plugin once, then direct-call `latency_budget_status` and `latency_round_start` to verify the 122-tool client schema and close LCN-046.