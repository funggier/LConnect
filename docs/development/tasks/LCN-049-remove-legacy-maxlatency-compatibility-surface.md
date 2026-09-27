# LCN-049 — Remove Legacy MaxLatency Compatibility Surface

Status: **COMPLETE — LEGACY MAXLATENCY SURFACE REMOVED / LIVE GREEN**

Date: 2026-09-27

## Goal

Make `ConfirmRetry-LConnect.cmd` the only user-facing command for confirming a Retry and remove the obsolete MaxLatency compatibility surface left over from LCN-046.

## Scope

Remove runtime/user-facing legacy artifacts:

- `SetMaxLatency-LConnect.cmd`
- `ResetMaxLatency-LConnect.cmd`
- `StatusMaxLatency-LConnect.cmd`
- CLI action `set-max`
- CLI action `reset-max`
- controller compatibility method `setMaxFromCurrentRound()`
- controller compatibility method `resetMax()`

Keep the current observation workflow:

- `ResetRound-LConnect.cmd` — explicit round boundary when manually needed
- `ConfirmRetry-LConnect.cmd` — the only Retry-confirmation command
- `StatusTurnRisk-LConnect.cmd` — current telemetry status
- MCP `latency_round_start`
- MCP `latency_budget_status`

Historical LCN-046–048 task/report records and persisted Retry evidence are retained as audit evidence. They may mention the old commands because those commands existed at that historical point; they are not current operational instructions.

## Invariants

- measurement model remains `turn_risk_observation_v2`
- OBSERVE only
- enforcement remains disabled
- no ceiling/prediction/blocking is reintroduced
- runtime state/history are preserved
- MCP catalog remains 122 tools
- current user documentation must not instruct use of any MaxLatency command

## Acceptance

- legacy CMD files removed: PASS
- `set-max` CLI action removed/rejected: PASS
- `reset-max` CLI action removed/rejected: PASS
- legacy controller methods removed: PASS
- current README/USAGE/TOOLS/TROUBLESHOOTING updated: PASS
- tests assert only current wrappers and legacy absence: PASS
- targeted latency smoke: PASS
- `npm run check`: PASS
- full `npm test`: PASS (53.296 s)
- dependency audit: PASS — 0 vulnerabilities
- CI exact-SHA #134 / run `36332464447`: PASS
- installed cleanup/parity: PASS — 193/193 tracked equal; legacy CMD files absent
- controlled restart/direct runtime validation: PASS — 1.2.0 / 122 tools
