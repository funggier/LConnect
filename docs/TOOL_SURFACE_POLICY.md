# LConnect Tool Surface Policy

Current main/runtime catalog: **154 tools**  
Current published release baseline: **v1.2.2 / 122 tools**

## 1. Status classes

### Canonical
Preferred public API for new workflows.

### Compatibility
Supported for existing workflows, but a newer canonical path should be preferred.

Current compatibility entry:
- `read_process_output` → prefer `read_process_events` for cursor-based output consumption.

### Deprecated
Still exposed temporarily for migration. New workflows should not choose it.

Current deprecated entry:
- `read_file` → `read_text_file`.

A deprecated or compatibility entry must identify a valid public replacement when a direct replacement exists.

## 2. Safety classes

The central metadata registry classifies tools into operational boundaries such as:
- read-only
- local-mutation
- process-control
- service-control
- scheduled-task-mutation
- git-mutation
- remote-action
- desktop-input
- browser-managed-mutation
- live-ui-mutation

This is classification metadata, not an additional confirmation framework.

## 3. Process canonical path

For new managed-process workflows prefer:
1. `start_process`
2. `session_status`
3. `read_process_events`
4. `wait_session`
5. `write_process_input` when needed
6. `terminate_process` when explicitly needed
7. `release_session` after terminal evidence is no longer required

`read_process_output` remains a compatibility buffered-output API.

## 4. Parameter conventions

Use these names when semantics match:
- seconds: `timeout_seconds`
- milliseconds: `timeout_ms`
- character output bounds: `max_chars` or a clearly scoped variant such as `max_total_chars`
- byte bounds: `max_bytes`
- item bounds: `limit`, `max_entries`, `max_matches`, or a domain-specific count when the semantics differ
- cursor progression: `after_seq`
- process identity guard: `expected_pid`, `expected_creation_time`
- non-mutating preview: `dry_run`

Do not rename parameters solely for visual uniformity when their semantics are materially different.

## 5. Result/error conventions

New or newly structured tools should prefer machine-readable error evidence with:
- `code`
- `message`
- `details`
- `retryable` when meaningful
- operation/identity context

Older tools may retain text-oriented compatible outputs. Do not mass-rewrite legacy result shapes merely for style. Where a legacy output is kept, the tool description must remain truthful.

## 6. Bounded-output policy

Public tools should avoid giant default payloads.

Current rules include:
- text reads have character bounds
- multi-file reads have per-file and total bounds
- media reads have an explicit byte bound
- directory lists/tree/search have entry/match bounds
- process/log events use bounded buffers/cursors
- Git/GitHub/HTTP/browser inspection tools keep explicit result bounds appropriate to their domain
- screenshots default to file-backed output instead of inline base64

When the operation naturally needs large output, prefer cursors, files, or narrow selectors rather than increasing a global default.

## 7. Managed browser vs live browser

### Deterministic managed/attached automation — `browser_*`
Uses WebDriver/CDP and isolated managed profiles by default. External profile reuse is explicit and guarded.

### Existing user-open browser — `browser_live_*`
Uses Windows UI Automation only. It does not enable WebDriver/CDP and does not access or mutate the normal browser profile.

### Generic desktop fallback
Use window/input tools only when the task is truly native UI interaction.

Native keyboard/mouse is not a silent fallback for DOM automation.

## 8. Catalog authority

`modules/tool-surface.mjs` is the central expected public-tool registry and metadata policy.

Tests must verify:
- expected catalog == actual source runtime catalog
- tool count is exact
- duplicate public names are absent
- every public tool is classified
- compatibility/deprecated replacements are valid
- current-facing documentation reflects the current main/runtime count and the distinct published-release count

`runtime_catalog` can return names and metadata on request and reports duplicate-name evidence.

## 9. Historical evidence

Historical task/report counts, PIDs and release states remain audit records. Do not rewrite them to match the current runtime.

Current-facing documentation must state current truth.
