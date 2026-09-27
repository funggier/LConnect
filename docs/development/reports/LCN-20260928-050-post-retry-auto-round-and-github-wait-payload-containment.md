# LCN 2026-09-28 — LCN-050 Post-Retry Auto-Round and GitHub Wait Payload Containment

## Status

**ACTIVE**

## Live root-cause evidence

The command itself is executable and round 20 proves that `ConfirmRetry-LConnect.cmd` can capture a Retry. The practical failure is the state transition after confirmation: the round remains `confirmed_retry` and later work tools are not tracked.

A direct installed CLI reproduction after round 20 returned `NO_ACTIVE_ROUND`.

The latest real Retry also occurred after a high-volume GitHub Actions polling phase. Post-confirm telemetry recorded 98 `github_run_wait` calls returning ~5.64 MB in total. In the final 8-minute polling window, 46 wait calls returned ~2.78 MB, typically ~61–64 KB each. The last wait completed ~215 seconds before diagnostics resumed after the user-visible Retry.

LCN-050 repairs both measurable contributors without claiming a fixed platform timeout threshold.

## Targeted implementation evidence

Post-Retry lifecycle:

- `latency_budget_status` after confirmation leaves the failed round visible and does not start work tracking: PASS
- first subsequent non-control work tool auto-starts round N+1: PASS
- that same work call is tracked as call 1: PASS
- a second Retry can then be confirmed without ResetRound or explicit `latency_round_start`: PASS
- explicit round-start remains compatible: PASS

GitHub wait containment:

- `github_run_wait` query omits the `jobs` field: PASS
- wait result omits jobs/steps: PASS
- `github_run_view` retains full jobs/steps: PASS
- real completed run #135 direct query measurement:
  - full run+jobs JSON: 2,387 bytes / ~1,538 ms
  - compact top-level JSON: 421 bytes / ~909 ms
  - payload reduction: ~82.36%

The problematic pre-Retry waits were ~61–64 KB each, so the expected reduction for those runs is materially larger than the small run #135 sample.

## Local validation

- targeted latency smoke: PASS
- targeted GitHub smoke: PASS
- `npm run check`: PASS
- `git diff --check`: PASS
- dependency audit: PASS — 0 vulnerabilities
- full `npm test`: PASS (54.585 s)
