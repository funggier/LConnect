# LCN 2026-09-27 — LCN-049 Remove Legacy MaxLatency Compatibility Surface

## Status

**ACTIVE**

## Reason

LCN-047 and LCN-048 replaced the original adaptive MaxLatency model with observation-only turn-risk telemetry. LCN-048 closed with `ConfirmRetry-LConnect.cmd` as the preferred Retry-confirmation command, while three obsolete MaxLatency CMD wrappers and two compatibility CLI actions still remained.

The project owner requested that only `ConfirmRetry-LConnect.cmd` be used for Retry confirmation and that old compatibility artifacts be removed rather than carried indefinitely.

## Planned cleanup

- delete `SetMaxLatency-LConnect.cmd`
- delete `ResetMaxLatency-LConnect.cmd`
- delete `StatusMaxLatency-LConnect.cmd`
- remove `set-max` / `reset-max` CLI actions
- remove legacy controller methods used only by those actions
- update current operational documentation
- retain historical task/report references as audit history

## Baseline

- main/local/remote: `85de3bb566fcd9a636d6176ac9e49553afac6701`
- repo clean
- runtime: `1.2.0 / 122 tools`
- model: `turn_risk_observation_v2`
- mode: OBSERVE
- enforcement: disabled

## Local implementation evidence

Removed:

- `SetMaxLatency-LConnect.cmd`
- `ResetMaxLatency-LConnect.cmd`
- `StatusMaxLatency-LConnect.cmd`
- CLI `set-max`
- CLI `reset-max`
- controller `setMaxFromCurrentRound()`
- controller `resetMax()`

Current operational wrappers:

- `ResetRound-LConnect.cmd`
- `ConfirmRetry-LConnect.cmd`
- `StatusTurnRisk-LConnect.cmd`

Validation:

- current operational grep contains no legacy MaxLatency references except negative-removal assertions in the smoke test: PASS
- targeted `tests/latency-budget-smoke.mjs`: PASS
- `npm run check`: PASS
- `git diff --check`: PASS
- dependency audit: PASS — 0 vulnerabilities
- full `npm test`: PASS (53.296 s)
- tool catalog expectation remains 122
