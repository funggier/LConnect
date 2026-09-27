# LCN 2026-09-27 — LCN-049 Remove Legacy MaxLatency Compatibility Surface

## Status

**COMPLETE — LIVE GREEN**

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

## GitHub / deployment evidence

- implementation commit: `e39c6575e32ba73232aac84437ec03a40619db0a`
- GitHub CI #134 / run `36332464447`: PASS
- installed targeted latency smoke: PASS
- installed legacy files:
  - `SetMaxLatency-LConnect.cmd`: absent
  - `ResetMaxLatency-LConnect.cmd`: absent
  - `StatusMaxLatency-LConnect.cmd`: absent
- source↔installed tracked parity before docs-only closure: `193/193` equal
- source/install manifest digest before docs-only closure: `9b8743b9514bdb4833e774e7da29253d17b468a1c79704dfed52ea07dece64e7`
- preserved local paths `mcp-conf.yaml`, `node_modules`, `logs`, `runtime`: PASS
- controlled Stop/Start: PASS
- tunnel start PID: `1992`
- direct LConnect runtime PID: `12364`
- runtime version/catalog: `1.2.0 / 122 tools`
- catalog digest: `4a8ef91a83938d4e835a7716c90c8784235708bdf31c5cb763b1d2911fecc525`
- measurement model remains `turn_risk_observation_v2`
- mode remains OBSERVE; enforcement remains disabled
- direct installed root listing exposes `ConfirmRetry-LConnect.cmd`, `ResetRound-LConnect.cmd`, `StatusTurnRisk-LConnect.cmd` and no MaxLatency wrapper

## Historical evidence boundary

The persisted round-13 Retry snapshot still contains the source string `SetMaxLatency-LConnect.cmd (compatibility alias)` because that is the command that actually captured the historical event before LCN-049. That value is retained as audit provenance; the wrapper/action itself no longer exists and cannot be invoked.

## Closure

LCN-049 is COMPLETE. `ConfirmRetry-LConnect.cmd` is now the sole user-facing Retry-confirmation command. `ResetRound-LConnect.cmd` and `StatusTurnRisk-LConnect.cmd` remain only for their distinct current roles. No MaxLatency compatibility command, CLI action, or controller alias remains operational.
