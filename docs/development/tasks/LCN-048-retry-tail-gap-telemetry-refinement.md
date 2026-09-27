# LCN-048 — Retry Tail-Gap Telemetry Refinement

Status: **ACTIVE**

Date: 2026-09-27

## Trigger

A second real user-visible Retry was confirmed after LCN-047 was live in observation-only mode.

The user ran the legacy compatibility command `SetMaxLatency-LConnect.cmd`; it correctly captured round 13 as a Retry snapshot without enabling enforcement.

## Round 13 evidence

- round start: `2026-09-27T15:34:47.375Z`
- user-confirmed Retry: `2026-09-27T15:38:11.742Z`
- round wall-clock: `204,367 ms`
- completed LConnect calls: `17`
- completed handler sum: `7,233.349 ms`
- handler share: `3.539%`
- maximum handler: `2,603.052 ms`
- observed idle including the terminal quiet period at confirmation: `197,130 ms`
- stored pre-call/inter-call idle total: `116,150 ms`
- largest stored pre-call/inter-call idle gap: `35,259 ms`
- last completed LConnect call: `2026-09-27T15:36:50.762Z`
- Retry confirmation: `2026-09-27T15:38:11.742Z`
- terminal quiet gap after the final LConnect call: `80,980 ms`
- total result bytes: `87,916`
- maximum single result: `46,928` bytes
- LConnect errors: `0`
- LConnect local timeouts: `0`

## Comparison with failed round 6

Round 6:

- wall-clock: `563,973 ms`
- handler sum: `36,899.003 ms`
- handler share: about `6.54%`
- calls: `14`
- max handler: about `6,922.6 ms`
- local timeouts: `0`

Round 13:

- wall-clock: `204,367 ms`
- handler sum: `7,233.349 ms`
- handler share: `3.539%`
- calls: `17`
- max handler: `2,603.052 ms`
- local timeouts: `0`

This further disproves a fixed handler-sum threshold, fixed call-count threshold, or single fixed round-wall threshold as a sufficient Retry model.

The terminal quiet gap is now a materially relevant observable, but it is correlation evidence only. LConnect still cannot prove which ChatGPT/platform phase caused the Retry.

## Problem

LCN-047 records terminal idle inside the Retry snapshot's `observed_idle_ms`, but:

1. it does not expose the terminal quiet period as a dedicated field;
2. `max_idle_gap_ms` covers only gaps observed before a subsequent tool call, not the terminal quiet period;
3. after a round becomes `confirmed_retry`, `currentRoundView()` stops adding the terminal gap, so the round view can disagree with the Retry snapshot.

## Goal

Make terminal quiet-gap evidence explicit and internally consistent without adding prediction or enforcement.

## Scope

Add:

- `tail_idle_ms` — time from the last completed tool call (or round start if no completed call) to the current/terminal observation endpoint while no call is in flight;
- `max_observed_gap_ms` — max of existing `max_idle_gap_ms` and `tail_idle_ms`;
- Retry snapshot persistence for both fields;
- CLI display for both fields;
- regression proving confirmed-round status and Retry snapshot agree.

Keep:

- `max_idle_gap_ms` for backward compatibility;
- 122-tool catalog unchanged;
- OBSERVE-only mode;
- no automatic ceiling;
- no blocking.

## Acceptance

- active round reports dynamic `tail_idle_ms`: PASS
- confirmed Retry freezes `tail_idle_ms` at confirmation endpoint: PASS
- confirmed round view equals Retry snapshot for observed idle/tail gap: PASS
- `max_observed_gap_ms` includes terminal quiet gap: PASS
- existing `max_idle_gap_ms` semantics remain compatible: PASS
- Retry snapshot normalization preserves new fields: PASS
- CLI status/Retry output shows new fields: PASS
- targeted smoke: PASS
- `npm run check`: PASS
- `git diff --check`: PASS
- dependency audit: PASS — 0 vulnerabilities
- full test suite: PASS (53.543 s)
- CI: PENDING
- installed deployment + direct live validation: PENDING
