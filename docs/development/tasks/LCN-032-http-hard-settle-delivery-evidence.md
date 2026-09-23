# LCN-032 — HTTP Hard-Settle Timeout + Delivery Evidence

Status: **ACTIVE**

## Goal

Strengthen LCN-031 so HTTP MCP handlers return at the local request deadline even if AbortSignal cancellation propagation itself stalls, and expose server-side completion timing that distinguishes LConnect execution time from downstream Tunnel/ChatGPT delivery latency.

## Trigger

Live connector testing after LCN-031 showed:

- direct Node AbortController: ~1002 ms for a 1000 ms deadline
- direct stdio MCP through LConnect: ~1019 ms
- live ChatGPT/Tunnel tool delivery: approximately 5000 ms for the same delayed-body fixture

This proves the current LConnect core can meet the deadline, but also exposed two improvement opportunities:

1. timeout completion should not depend on a consumer promptly observing AbortSignal
2. timeout/error responses should include LConnect-local elapsed/completion evidence

## Scope

- hard-settle `withFetchDeadline` at the configured deadline using an outer timeout race
- still abort the underlying fetch/body operation
- suppress late rejection after the outer timeout has already settled
- retain download temp-file cleanup
- add safe structured timing evidence to HTTP timeout/error results
- tighten timeout regression test so a 1-second budget cannot pass by waiting for the full 3-second delayed body
- no change to MCP channel architecture
- no workflow/orchestration behavior
- no modification to tunnel-client binary

## Acceptance

- 1-second HTTP body deadline returns from direct MCP materially below the 3-second delayed-body fixture
- test threshold is strict enough to fail if the handler waits for the whole body delay
- timeout result includes local handler elapsed/completion evidence
- HTTP success behavior remains unchanged
- download timeout cleanup remains correct
- full test suite + audit PASS
- GitHub CI PASS
