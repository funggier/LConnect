# LCN-034 — Bounded Read-Only Batch Inspection

Status: **ACTIVE**

## Goal

Reduce accumulated MCP round-trip/delivery overhead by allowing several explicit read-only inspection operations to execute inside one bounded MCP call.

## Evidence

LCN-033 live validation measured 10 representative calls:

- caller wall time: 36095 ms
- LConnect handler time: 1196.979 ms
- difference outside handlers: 34898.021 ms
- outside-handler share: approximately 96.7%

This makes avoiding unnecessary round trips materially more valuable than further micro-optimizing already-fast local handlers.

## Tool

Add:

`batch_inspect`

## Contract

Input contains an explicit ordered list of operations.

Each operation contains:

- optional caller ID
- allowlisted tool name
- arguments for that tool

Execution is deterministic and sequential inside LConnect.

Default limits:

- max 10 operations per batch
- bounded result characters per operation
- bounded total result characters
- explicit truncation metadata
- optional `stop_on_error`

## Read-only allowlist

Initial allowlist is intentionally narrow and can include:

- filesystem inspection/read
- managed-session listing
- system/hardware inspection
- process inspection
- Git read operations
- project/build-system detection
- log read/search

It must exclude:

- writes/edits/moves
- shell execution
- process start/terminate/restart
- Git mutation/fetch/pull/push/commit
- watcher/follower creation
- Scheduled Task mutation
- Services mutation
- environment mutation
- HTTP/network side-effect-capable operations
- `refresh_state` pruning
- nested `batch_inspect`
- `tool_telemetry`

## Architecture

- one tunnel
- one `main` MCP channel
- one MCP server
- ChatGPT chooses every operation explicitly
- no conditional branching
- no loops
- no planner
- no "continue until done"
- no persistent workflow state

## Implementation direction

Reuse the already-registered allowlisted handlers inside the same MCP server so semantics stay aligned with direct tool calls.

Validate each sub-operation with the existing MCP tool schema.

LCN-033 telemetry should record both:

- the outer `batch_inspect` handler
- each internal allowlisted handler

Internal events should share the same MCP request ID where available, enabling correlation.

## Implementation progress

- Added `modules/batch-inspect.mjs`.
- Added `batch_inspect`.
- Reuses the existing registered tool schemas/handlers rather than duplicating capability logic.
- Initial allowlist includes read-only filesystem/session/system/process/service/network/hardware/Git/project/log/watch/Scheduled Task/PATH inspections.
- Mutation/execution tools are rejected with `TOOL_NOT_ALLOWED`.
- Max 10 operations per call.
- Ordered sequential execution.
- `stop_on_error` semantics implemented.
- Per-result and total character bounds implemented with explicit `truncated` evidence.
- LCN-033 telemetry records internal handlers plus the outer batch under the same MCP request ID.
- Catalog increased from 97 to 98 tools.
- Targeted batch smoke: PASS.
- Full local suite: PASS / 98 tools.
- Dependency audit: 0 vulnerabilities.

## Acceptance

- 5 representative read-only operations complete in one MCP call
- operation ordering is preserved
- invalid/non-allowlisted tool is rejected per operation
- `stop_on_error` semantics are deterministic
- per-operation and total result bounds are enforced
- direct tool behavior remains unchanged
- telemetry records internal handlers plus batch
- full catalog = 98 tools
- full test suite + audit PASS
- GitHub CI PASS
- live batch wall time is compared against prior individual-call baseline
