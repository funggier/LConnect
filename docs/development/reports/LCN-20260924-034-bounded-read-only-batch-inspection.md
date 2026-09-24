# LCN 2026-09-24 — LCN-034 Bounded Read-Only Batch Inspection

## Result

**PASS — ROUND-TRIP REDUCTION PRIMITIVE GREEN**

## Trigger

LCN-033 live telemetry measured 10 representative Tool calls:

- caller wall: 36095 ms
- LConnect handlers: 1196.979 ms
- outside-handler difference: 34898.021 ms
- outside-handler share: approximately 96.7%

This established that accumulated MCP round trips were a more important optimization target than further micro-optimizing already-fast handlers.

## Implementation

Added:

`batch_inspect`

Catalog increased:

`97 → 98 tools`

The tool accepts up to 10 explicit ordered operations and executes them sequentially inside one MCP handler.

Each operation provides:

- optional caller ID
- allowlisted read-only tool name
- arguments

## Safety / architecture

The initial allowlist is read-only.

Allowed capability classes include:

- filesystem read/inspection
- session/system/process inspection
- Services read
- network/hardware inspection
- Git read
- project/build-system detection
- log/watch event read
- Scheduled Task read
- PATH/which

Explicitly excluded:

- file mutation
- shell execution
- process start/terminate/restart
- Git mutation/fetch/pull/push
- Services mutation
- Scheduled Task mutation
- environment mutation
- HTTP requests
- watcher/follower creation
- nested batch
- telemetry tool

There is no:

- planner
- branching
- loop
- retry policy
- autonomous continuation
- persistent workflow state

ChatGPT remains the intelligence/workflow owner.

## Result bounds

Default:

- max 10 operations
- `max_chars_per_result = 4000`
- `max_total_chars = 20000`

Each result reports:

- success/error
- local operation elapsed time
- original result bytes/chars
- returned chars
- explicit truncation state
- bounded result text

This prevents round-trip reduction from creating unbounded large responses.

## Reuse of existing handlers

`batch_inspect` invokes the already-registered allowlisted tool handlers using the same MCP input validation and output validation path.

Capability logic is therefore not duplicated.

## Telemetry correlation

LCN-033 records:

- outer `batch_inspect`
- every internal allowlisted handler

under the same MCP request ID when available.

This permits one caller wall measurement to be compared with all local work executed inside the batch.

## Validation

Implementation commit:

`6d85cc0138bfa5955490b758db3f33a76b268cff`

GitHub Actions:

`35960766521 — PASS`

Local:

- `npm run check`: PASS
- targeted batch smoke: PASS
- full suite: PASS / 98 tools
- dependency audit: 0 vulnerabilities

Acceptance:

- five-operation single MCP call: PASS
- ordered results: PASS
- mutation allowlist guard: PASS
- stop-on-error false/true: PASS
- per-result/total bounds: PASS
- telemetry request correlation: PASS
- direct tool compatibility: PASS

## Next live validation

After runtime restart:

1. clear telemetry
2. measure a representative set of individual read-only calls
3. run the equivalent inspections through one `batch_inspect`
4. compare caller wall time
5. compare batch handler time and internal handler sum
6. confirm that fewer round trips materially reduce whole-turn elapsed time

Only then decide whether additional specialized batches are warranted.
