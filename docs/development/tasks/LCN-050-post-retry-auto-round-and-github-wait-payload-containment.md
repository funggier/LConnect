# LCN-050 — Post-Retry Auto-Round and GitHub Wait Payload Containment

Status: **COMPLETE — POST-RETRY TRACKING + COMPACT WAIT LIVE GREEN**

Date: 2026-09-28

## Trigger

The user reported that `ConfirmRetry-LConnect.cmd` appeared not to work and then reported another real Retry.

Live evidence showed two separate reliability defects.

## Defect A — ConfirmRetry lifecycle gap

Round 20 was successfully captured by `ConfirmRetry-LConnect.cmd`:

- confirmed at: `2026-09-27T17:11:46.778Z` UTC / `2026-09-28 00:11:46` Asia/Bangkok
- calls: 191
- round wall-clock: 1,907,983 ms
- handler sum: 260,566.668 ms
- tail idle: 358,736 ms
- result bytes: 1,008,684
- errors/timeouts: 0 / 0

After confirmation, the persisted round remained `confirmed_retry`.

`beforeTool()` tracks only `active` rounds, so every later work call ran with `tracked=false`.

A direct call to the current CLI reproduced:

`NO_ACTIVE_ROUND: Run ResetRound-LConnect.cmd before a deliberate observation round, or let the AI call latency_round_start.`

Therefore a later real Retry cannot be captured unless an explicit round-start call happened first.

## Defect B — GitHub wait payload / polling pressure

Telemetry after the round-20 confirmation and before the latest Retry:

- 202 work-tool events
- handler time: 695,790.045 ms
- result bytes: 6,215,536
- errors: 5
- local timeouts: 1

Dominant tool:

- `github_run_wait`: 98 calls
- handler time: ~597,993.697 ms
- result bytes: 5,638,797
- max handler: 8,502.102 ms

In the final observed polling window from `17:35:04Z` to `17:43:04Z`:

- 48 GitHub observation calls
- 46 were `github_run_wait`
- handler time: ~282,481 ms
- result bytes: ~2.905 MB
- individual wait results were commonly ~61–64 KB

The final `github_run_wait` completed at `17:43:04.341Z`, followed by an observed quiet gap of approximately 215,338 ms before diagnostics resumed at `17:46:39.679Z`, when the user had reported Retry.

This is correlation evidence, not proof of the ChatGPT/platform timeout root cause. However, repeatedly fetching and returning full jobs/steps for status polling is unnecessary pressure.

## Goals

1. After a confirmed Retry, automatically start the next observation round on the **first subsequent non-control LConnect work tool**.
2. Keep explicit `latency_round_start` and `ResetRound-LConnect.cmd` available but do not require them merely to recover from ConfirmRetry.
3. Make `ConfirmRetry-LConnect.cmd` usable again on the next actual failed round without a manual reset step.
4. Make `github_run_wait` use a compact run-status query/result that omits jobs/steps.
5. Keep `github_run_view` as the explicit full-detail jobs/steps tool.
6. Preserve OBSERVE-only / no blocking semantics.

## Auto-round contract

- `confirm-retry` snapshots the active failed round exactly as before.
- State may remain `confirmed_retry` as historical/current marker.
- The first subsequent non-control work tool detects `confirmed_retry`, creates round `N+1`, starts it at that work tool's start timestamp, then tracks that same call as call 1.
- This is not inferred from request IDs or idle gaps.
- Control tools such as `latency_budget_status` do not auto-start a work round.
- Explicit `latency_round_start` still starts a new round deterministically.

## GitHub wait compact contract

`github_run_wait` returns compact top-level run metadata only:

- id / number / workflow
- branch / SHA / event
- status / conclusion
- timestamps / URL

It does **not** return jobs/steps. Users/AI call `github_run_view` only when full job/step detail is needed.

The underlying wait status query also omits the `jobs` JSON field.

## Acceptance

- current confirmed-retry state reproduces NO_ACTIVE_ROUND before fix: PASS
- first work tool after confirmed Retry auto-starts next round: PASS (targeted)
- auto-started first work tool is counted as call 1: PASS (targeted)
- second Retry can be confirmed without manual ResetRound/latency_round_start: PASS (targeted)
- control/status tool does not auto-start work round: PASS (targeted)
- explicit round-start remains compatible: PASS (targeted)
- `github_run_wait` underlying query omits jobs: PASS (targeted)
- `github_run_wait` result omits jobs/steps: PASS (targeted)
- `github_run_view` still returns full jobs/steps: PASS (targeted)
- targeted latency smoke: PASS
- targeted GitHub smoke: PASS
- `npm run check`: PASS
- full `npm test`: PASS (54.585 s)
- dependency audit: PASS — 0 vulnerabilities
- exact-SHA CI #136 / run `36338889503`: PASS
- installed deployment + controlled restart: PASS — 195/195 tracked equal before closure
- live direct validation: PASS — real confirmed round 20 transitioned to round 21 on first work tool; compact wait result 832 bytes
