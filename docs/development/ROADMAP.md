# LConnect Expansion Roadmap

## Vision

LConnect should evolve from a local MCP filesystem/shell bridge into a modular Windows execution and automation substrate for AI agents.

The target is not merely "more commands." The target is:

> a direct MCP Plugin with structured local capabilities that let an external AI start long-running work, regain control quickly, wait/read incrementally, verify results, and decide the next action without turning LConnect itself into an autonomous workflow runtime.

## Architecture invariant

```text
ChatGPT
  |
OpenAI Tunnel
  |
main MCP channel
  |
LConnect Core
  |
  +-- System modules
  +-- Development modules
  +-- Observation modules
  +-- Desktop modules
  +-- Browser modules
```

Ordinary capability growth should happen by registering modules into the existing Core, not by creating new tunnel channels.

---

# Phase 1 — System Foundation

## LCN-007 Environment Module

Primary tools:

- `env_get`
- `env_list`
- `env_set`
- `path_list`
- `which`

Reason:

Environment inspection underpins almost every development/runtime diagnostic.

## LCN-008 Process Advanced

Primary tools:

- `process_details`
- `process_tree`
- `find_process`
- `wait_process`
- `restart_process`

Reason:

Current process tools are functional but PID/session oriented. Advanced structured process introspection is needed for service/runtime repair.

## LCN-009 Windows Services

Primary tools:

- `list_services`
- `get_service`
- `start_service`
- `stop_service`
- `restart_service`
- `set_service_startup`

Reason:

Direct Windows service lifecycle control is important for local runtimes and persistent infrastructure.

## LCN-010 Port / Network

Primary tools:

- `tcp_connections`
- `udp_endpoints`
- `port_owner`
- `port_test`
- `dns_lookup`
- `network_interfaces`
- `ping_host`

Reason:

Ports and local networking are frequent root causes in tunnels, dashboards, local AI servers, development servers, and IPC.

## LCN-011 Hardware

Primary tools:

- `cpu_info`
- `memory_info`
- `disk_info`
- `gpu_info`
- `storage_health`
- `battery_info` when applicable

Reason:

Structured resource/hardware evidence improves debugging and workload decisions.

---

# Phase 2 — Developer Foundation

## LCN-012 Git Module

Primary tools:

- `git_status`
- `git_diff`
- `git_log`
- `git_branch`
- `git_commit`
- `git_fetch`
- `git_pull`
- `git_push`
- `git_worktree`

Design principle:

Prefer stable machine-readable Git formats such as porcelain output instead of parsing human-formatted text.

## LCN-013 Development Module

Primary tools:

- `detect_project`
- `detect_build_system`
- `project_info`
- `install_dependencies`
- `run_build`
- `run_tests`
- `run_lint`

Long operations should return sessions/jobs rather than block one MCP call.

## LCN-014 HTTP Client

Primary tools:

- `http_request`
- `http_probe`
- `http_headers`
- `http_download`

Reason:

Needed for local API validation, dashboards, service health and integration testing.

---

# Phase 3 — Observation and Persistence

## LCN-015 Log Tail

Primary tools:

- `tail_file`
- `follow_log`
- `read_log_events`
- `search_log`
- `stop_log_follow`

Use session IDs and incremental cursors.

## LCN-016 File Watcher

Primary tools:

- `watch_path`
- `watch_events`
- `watch_status`
- `stop_watch`

Do not hold an MCP call open while waiting for filesystem events.

## LCN-017 Scheduled Tasks

Primary tools:

- `list_scheduled_tasks`
- `get_scheduled_task`
- `create_scheduled_task`
- `run_scheduled_task`
- `stop_scheduled_task`
- `enable_scheduled_task`
- `disable_scheduled_task`
- `delete_scheduled_task`

Reason:

Provides durable Windows automation across reboot/session boundaries.

---

# Phase 4 — Agent Operations Reliability

Detailed plan:

[AGENT_OPERATIONS_RELIABILITY_PLAN.md](AGENT_OPERATIONS_RELIABILITY_PLAN.md)

This phase is intentionally small and contains only six capability groups derived from real long-running development/release use:

## LCN-025 Managed Session Completion

Primary tool:

- `wait_session`

Reason:

Remove repeated sleep/poll orchestration while keeping long-running local process lifetime independent from one MCP request.

## LCN-026 Incremental Process Output Cursor

Primary tool:

- `read_process_events`

Reason:

Bring managed process output to the same cursor/sequence model already proven by Log Tail and File Watcher.

## LCN-027 Structured Text Search

Primary tool:

- `search_text`

Reason:

Common source/config diagnosis should not require shell-specific `Select-String`, `findstr` or `rg` parsing.

## LCN-028 File Integrity

Primary tools:

- `file_hash`
- `compare_files`

Reason:

Source/installed parity and release artifact verification are frequent operations and should return exact structured SHA-256 evidence.

## LCN-029 Exact Git Ref / Ancestry Safety

Primary tools:

- `git_remote_ref`
- `git_is_ancestor`
- `git_push_ref`

Reason:

Exact-SHA release/ref workflows should not require raw Git while preserving the existing non-force safety model.

## LCN-030 GitHub Actions / Release Integration

Primary scope:

- Actions run list/view/wait/failed logs
- workflow dispatch
- release metadata
- release asset download

Reason:

Common GitHub CI/release workflows currently require raw `gh` orchestration and parsing.

The phase is complete only after LCN-025–030 pass local runtime acceptance and GitHub CI.

---

# Phase 4A — Delivery / Turn Reliability — COMPLETE AT CURRENT LOCAL EVIDENCE BOUNDARY

LCN-031–039 addressed bounded synchronous execution, delivery telemetry, runtime/catalog visibility and local latency localization without turning LConnect into a workflow runtime.

Completed capabilities include:

- MCP synchronous request containment
- HTTP hard-settle timeout evidence
- general tool-handler telemetry
- bounded read-only batch inspection
- turn-safe long-operation observation
- runtime catalog / plugin-refresh evidence
- GitHub wait-budget separation
- structured delivery correlation snapshot
- local delivery phase localization

Current decision: do not add speculative timeout/retry layers. Reopen only when a reproducible incident or a new cross-boundary tracing primitive provides new evidence.

---

# Phase 4B — Execution Ergonomics — COMPLETE AT CURRENT NEED

LCN-040–044 added deterministic structured primitives only where repeated real work showed a concrete round-trip or evidence gap:

## LCN-040 Structured Data Inspection

- `structured_data_inspect`
- bounded JSON/YAML/TOML inspection through RFC 6901 JSON Pointer

## LCN-041 Directory Manifest and Comparison

- `directory_manifest`
- `compare_directories`
- deterministic streamed tree-digest/parity evidence

## LCN-042 Git Sync Verification

- `git_sync_status`
- exact remote state versus local HEAD/tracking state without implicit fetch

## LCN-043 Exact Commit GitHub CI Correlation

- `github_commit_run_status`
- exact commit → Actions run/jobs/steps in one bounded network-backed direct call

## LCN-044 Deployment Verification Snapshot

- `deployment_verification_snapshot`
- tracked source↔installed parity, package/dependency evidence, preserved local paths and running runtime catalog in one bounded read-only snapshot

Execution Ergonomics is not an open-ended request to add more tools. Additional work should be created only when a repeated real workflow exposes a deterministic capability/evidence gap that existing tools or `batch_inspect` cannot address cleanly.

## Release checkpoint — LCN-045 / v1.2.0

After LCN-044, publish **v1.2.0 — Reliability & Verification** from one exact release candidate with 120 tools, final CI, installed-runtime verification, reproducible Git archive and post-publication asset/tag verification.

---

# Phase 5 — Desktop Control

## LCN-018 Clipboard

Primary tools:

- `clipboard_get`
- `clipboard_set`
- `clipboard_clear`

Small implementation surface with high practical value.

## LCN-019 Window Control

Primary tools:

- `list_windows`
- `get_window`
- `focus_window`
- `move_window`
- `resize_window`
- `minimize_window`
- `maximize_window`
- `close_window`

Prefer HWND-based addressing over coordinate heuristics.

## LCN-020 Keyboard / Mouse

Primary tools:

- `key_press`
- `key_combo`
- `type_text`
- `mouse_move`
- `mouse_click`
- `mouse_scroll`

Input automation is a fallback/control layer, not the preferred way to interact with browser DOM.

---

# Phase 6 — Browser Automation

## LCN-021 Common Browser Layer

Create browser session abstraction independent of backend.

Example:

```text
browser_start(browser="firefox")
 -> browser_session_id

browser_tabs(session_id)
browser_navigate(session_id, url)
browser_snapshot(session_id)
browser_click(session_id, target)
browser_type(session_id, target, text)
```

Common capabilities:

- start / attach / stop
- tabs
- navigation
- DOM snapshot/query
- click/type/select/scroll
- text/attribute retrieval
- screenshot
- console/network events

## LCN-022 Firefox Adapter — Primary

Primary backend:

- WebDriver BiDi
- geckodriver / Marionette where useful

Firefox is the preferred browser for the project owner and is first-class, not fallback.

Support both:

- LConnect-managed Firefox instance
- attaching to an automation-enabled existing Firefox where technically appropriate

Do not use Firefox CDP as architecture baseline.

## LCN-023 Chrome Adapter — Secondary

Primary backend:

- Chrome DevTools Protocol (CDP)

Chrome should support the same common Browser API while retaining optional Chrome-specific deep diagnostics.

## Explicit non-goal for first browser phase

Microsoft Edge is not required.

The adapter architecture should allow Chromium-family support later without making Edge a dependency.

---

# Cross-cutting design requirements

Every module should define:

1. structured input schema
2. structured output where practical
3. bounded output
4. timeout semantics
5. cancellation/session behavior for long operations
6. validation tests
7. failure messages that preserve root cause
8. documentation
9. minimal external dependencies
10. compatibility with relocatable installation

## Long-running execution rule

Do not solve upstream timeout by only increasing timeout values.

Prefer direct-operation sessions:

```text
AI starts operation
 -> LConnect returns session id
 -> local work continues after that MCP request returns
 -> AI uses bounded wait/read incremental state
 -> AI cancels/terminates when needed
 -> AI decides what happens next
```

This pattern should be reused by:

- builds/tests
- file watchers
- log followers
- browser sessions

These sessions exist to help the external AI work continuously for longer periods. They are not persistent workflows: LConnect does not plan the next step, keep a workflow graph, or autonomously continue a task after the caller disappears.
