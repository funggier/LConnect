# ACTIVE — LConnect Development

Last updated: 2026-09-27

## Current state

- Repository: `funggier/LConnect`
- Branch: `main`
- Latest published release: **v1.2.0 — Reliability & Verification** (120 tools)
- Source version: `1.2.0`
- Current source candidate catalog: **122 tools**
- Installed/running daemon before LCN-046 deployment: **1.2.0 / 120 tools**
- ChatGPT-visible catalog before LCN-046 deployment/refresh: **120 tools**
- LCN-046: ACTIVE — User-Confirmed Adaptive Turn Latency Budget
- LCN-018–023: DEFERRED — Desktop Control / Browser Automation

## Active task

### LCN-046 — User-Confirmed Adaptive Turn Latency Budget

Status: **ACTIVE — LOCAL GREEN / EXACT-COMMIT CI + LIVE DEPLOYMENT PENDING**

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

Commit/push the exact local-green candidate, require exact-commit GitHub CI PASS, deploy tracked source to the installed tree, restart LConnect, verify runtime catalog 122 and latency controls, then refresh ChatGPT connector/plugin for direct-tool validation.