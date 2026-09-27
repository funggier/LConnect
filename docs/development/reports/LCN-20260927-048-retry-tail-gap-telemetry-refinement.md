# LCN 2026-09-27 — LCN-048 Retry Tail-Gap Telemetry Refinement

## Status

**COMPLETE — LIVE GREEN / RETRY TAIL-GAP TELEMETRY**

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

## Corrective and deployment evidence

- corrective commit: `04cee51b61cf109c9353c1febb127348ea377c8d`
- corrective CI #132 / run `36331165329`: PASS
- installed corrective targeted smoke: PASS
- source↔installed before docs-only closure: `194/194` tracked equal
- source/install manifest digest before docs-only closure: `300b8d785199b59c3313eac16f0b6eb40c3a009d023dfbea19fd4e663dd737ab`
- controlled Stop/Start via independent BConnect: PASS
- tunnel after restart: PID `23040`
- direct LConnect runtime after restart: PID `36936`
- runtime version/catalog: `1.2.0 / 122 tools`
- runtime catalog digest: `4a8ef91a83938d4e835a7716c90c8784235708bdf31c5cb763b1d2911fecc525`
- measurement model: `turn_risk_observation_v2`
- mode: OBSERVE
- enforcement: disabled
- pre-LCN-048 Retry round 13 reload:
  - `tail_idle_ms: null`
  - `max_observed_gap_ms: null`
  - `last_call_completed_at: null`
  - therefore no false zero was invented for fields that did not exist when the snapshot was captured
- derived round 13 terminal quiet gap remains documented as ~80,980 ms from the retained timeline, not rewritten into the historical snapshot
- fresh live round 15 started at zero with `tail_idle_ms=0` and `max_observed_gap_ms=0`
- subsequent live status showed the new dynamic tail fields operating independently from handler time
- no synthetic Retry was created for closure

## Closure

LCN-048 is COMPLETE at the current evidence boundary. Future real Retry events captured after this deployment will persist terminal tail-gap evidence directly. No automatic timeout threshold, prediction, or handler-sum blocking has been reintroduced.
