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

## GitHub / deployment evidence

- implementation commit: `b36f8c5b595ddf4f5d3483eabc8c674e4263c714`
- GitHub CI #136 / run `36338889503`: PASS
- installed targeted latency smoke: PASS
- installed targeted GitHub smoke: PASS
- source↔installed tracked parity before closure: `195/195` equal
- source/install manifest digest before closure: `dc8ceebcf636a276d92b3fcd0b43264a371fec4090719ac82296ac6817317540`
- controlled Stop/Start: PASS
- tunnel start PID: `45492`
- direct LConnect runtime PID: `32380`
- runtime: `1.2.0 / 122 tools`
- runtime catalog digest unchanged: `4a8ef91a83938d4e835a7716c90c8784235708bdf31c5cb763b1d2911fecc525`

## Live post-Retry state-machine validation

The installed state before validation was the real persisted round 20 in `confirmed_retry` from the user's actual ConfirmRetry event.

1. `latency_budget_status` did not start a work round and reported `next_work_tool_auto_starts_round=true`: PASS
2. first non-control work call (`runtime_catalog`) automatically created round 21: PASS
3. that same call was persisted as round 21 call 1 with `start_source=post_retry_first_work_tool`: PASS
4. no ResetRound or explicit `latency_round_start` was required for this transition: PASS

## Live compact GitHub wait validation

`github_run_wait(wait_seconds=0)` against completed CI #136 returned:

- no jobs/steps in result
- MCP result bytes: `832`
- handler time: ~`1,550 ms`
- round 21 call count advanced from 1 to 2

The problematic pre-fix waits were commonly ~63 KB each. The live compact result is roughly 98.7% smaller than a representative 63 KB pre-fix wait payload, while preserving top-level run status/conclusion.

## Clean post-validation boundary

A fresh explicit round 22 was started after live validation:

- call count: 0
- handler sum: 0
- result bytes: 0
- errors/timeouts: 0 / 0

## Closure

LCN-050 is COMPLETE at the current evidence boundary. The latest Retry could not be captured as a formal round because the pre-fix post-Confirm lifecycle left later calls untracked; its telemetry was reconstructed from the bounded tool telemetry buffer. Future Retry events after this deployment can be confirmed without a manual round reset, and GitHub Actions polling no longer returns full jobs/steps on every wait call.
