# LCN 2026-09-27 — LCN-048 Retry Tail-Gap Telemetry Refinement

## Status

**ACTIVE — TARGETED GREEN / FULL VALIDATION PENDING**

## Trigger

A second real user-visible Retry occurred after LCN-047 was already live in observation-only mode. The user ran `SetMaxLatency-LConnect.cmd`, which correctly captured round 13 without enabling enforcement.

## Round 13 Retry evidence

- round start: `2026-09-27T15:34:47.375Z`
- Retry confirmation: `2026-09-27T15:38:11.742Z`
- wall-clock: `204,367 ms`
- calls: `17`
- handler sum: `7,233.349 ms`
- handler share: `3.539%`
- max handler: `2,603.052 ms`
- stored pre-call/inter-call idle total: `116,150 ms`
- Retry snapshot observed idle including terminal quiet time: `197,130 ms`
- last LConnect call completed: `2026-09-27T15:36:50.762Z`
- terminal quiet gap to Retry confirmation: `80,980 ms`
- result bytes total: `87,916`
- max result bytes: `46,928`
- errors: `0`
- local timeouts: `0`

This second real failure further invalidates a fixed handler-sum, call-count, or single fixed wall-clock threshold. The terminal quiet period is a useful observable but not proof of platform causality. Because its endpoint is the user-confirmation timestamp, it may include a small unknown reaction/click delay after the UI first shows Retry; it is therefore an observed upper bound rather than an exact platform timeout measurement.

## Repair

Add explicit observation fields:

- `tail_idle_ms`
- `max_observed_gap_ms`
- `last_call_completed_at` on Retry snapshots

Behavior:

- active rounds report dynamic tail idle
- confirmed Retry rounds freeze tail idle at `completed_at`
- confirmed-round status and Retry snapshot report the same observed idle/tail values
- `max_idle_gap_ms` remains backward-compatible
- `max_observed_gap_ms` is max(existing idle gap, terminal tail)
- no prediction or enforcement is added

## Targeted evidence

- module syntax: PASS
- CLI syntax: PASS
- targeted latency smoke: PASS
- active tail idle: PASS
- confirmed tail idle freeze: PASS
- confirmed status/snapshot consistency: PASS
- max observed gap includes terminal quiet period: PASS
- observation-only/no blocking behavior preserved: PASS
- legacy schema-v2 Retry snapshots without tail fields normalize them as null/none rather than false zero: PASS

## Local validation

- `npm run check`: PASS
- dependency audit: PASS — 0 vulnerabilities
- `git diff --check`: PASS
- primary full `npm test`: PASS (53.543 s)
- legacy-snapshot corrective full `npm test`: PASS (54.669 s)

## Implementation evidence

- implementation commit: `ec62ae32efa9f8a8f63f25ffd6d2ed774d27daaa`
- GitHub CI #131 / run `36330784749`: PASS
- pre-deployment delta: 185/194 equal, 7 changed, 2 missing — exactly the 9 LCN-048 files
- preserved local paths: config/dependencies/logs/runtime present

## Pending

- CI completion
- installed sync
- controlled restart
- live direct validation
