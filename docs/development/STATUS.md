# STATUS — LConnect Development

Last updated: 2026-09-23

## Overall

Current project state: **BASIC CORE STABLE / AGENT OPERATIONS RELIABILITY ACTIVE**

Current published release: **v1.1.0 — Expanded Tools & First-Run Guide**

Current main MCP catalog: **96 tools**

LConnect มี Core ที่ใช้งานจริงแล้วและผ่าน runtime acceptance บน Windows:

- filesystem
- shell
- process/session
- system diagnostics
- full-machine access by default
- tunnel-client updater/version gate
- timeout recovery baseline
- CI
- Thai documentation
- GitHub releases

Expansion phase ถัดไปเน้น Agent Operations Reliability ชุดเล็ก LCN-025–030 ก่อน Desktop/Browser automation เพื่อให้ long-running process, evidence, Git และ release workflow มี structured semantics ที่ครบขึ้น

## Workstream status

| Workstream | Status | Task range | Notes |
|---|---|---:|---|
| Core / Tunnel | COMPLETE | LCN-001–006 | Baseline + recovery + coordination |
| System Foundation | COMPLETE | LCN-007–011 | Environment + Process + Services + Network + Hardware complete |
| Developer Foundation | COMPLETE | LCN-012–014 | Git + Development + HTTP complete |
| Observation | COMPLETE | LCN-015–017 | Log Tail + File Watcher + Scheduled Tasks complete |
| Agent Operations Reliability | ACTIVE | LCN-025–032 | LCN-025/026, LCN-031 and LCN-032 complete; Structured Text Search next |
| Desktop Control | PLANNED | LCN-018–020 | Deferred until LCN-025–030 complete |
| Browser Automation | PLANNED | LCN-021–023 | Common browser layer + Firefox + Chrome |

## Completed baseline

### LCN-001 — Modular MCP Core
**COMPLETE**

25 tools exposed through one `main` MCP channel.

### LCN-002 — Full-machine access default
**COMPLETE**

Filesystem full-machine access by default; actual capability remains bounded by Windows account permissions.

### LCN-003 — Documentation / CI / v1.0.0 Basic
**COMPLETE**

Thai docs, install/start/status/stop scripts, Windows CI, first ZIP release.

### LCN-004 — Timeout recovery root cause
**COMPLETE**

Identified tunnel-client 0.0.12 shared-stdio recovery defect after response deadline.

### LCN-005 — v1.0.1 Basic Recovery
**COMPLETE**

Added tunnel-client updater and minimum version gate `>=0.0.14`.

### LCN-006 — v1.0.2 Status diagnostics
**COMPLETE**

Separated liveness/readiness/control-plane health; optional MCP health route no longer causes false failure.

### LCN-007 — Environment Module
**COMPLETE**

Added 5 structured environment tools:

- `env_get`
- `env_list`
- `env_set`
- `path_list`
- `which`

Tool catalog increased from 25 to 30. Windows PATH/PATHEXT resolution and persistent user environment mutation passed CI.

### LCN-008 — Process Advanced
**COMPLETE**

Added 5 structured process lifecycle tools:

- `process_details`
- `process_tree`
- `find_process`
- `wait_process`
- `restart_process`

Tool catalog increased from 30 to 35. PID + creation-time identity guards and disposable-process restart/wait tests passed CI.

### LCN-009 — Windows Services
**COMPLETE**

Added 6 structured service tools:

- `list_services`
- `get_service`
- `start_service`
- `stop_service`
- `restart_service`
- `set_service_startup`

Tool catalog increased from 35 to 41. Disposable Windows Service lifecycle/startup-mode tests passed CI.

### LCN-010 — Port / Network
**COMPLETE**

Added 7 structured network tools:

- `tcp_connections`
- `udp_endpoints`
- `port_owner`
- `port_test`
- `dns_lookup`
- `network_interfaces`
- `ping_host`

Tool catalog increased from 41 to 48. Local TCP/UDP fixture tests passed without external internet dependencies.

### LCN-011 — Hardware
**COMPLETE**

Added 6 structured hardware diagnostic tools:

- `cpu_info`
- `memory_info`
- `disk_info`
- `gpu_info`
- `storage_health`
- `battery_info`

Tool catalog increased from 48 to 54. Hardware telemetry explicitly distinguishes observed data from unavailable data and passed both local and CI acceptance.

### LCN-012 — Git Module
**COMPLETE**

Added 9 structured Git tools:

- `git_status`
- `git_diff`
- `git_log`
- `git_branch`
- `git_commit`
- `git_fetch`
- `git_pull`
- `git_push`
- `git_worktree`

Tool catalog increased from 54 to 63. End-to-end disposable repository + local bare remote tests passed CI.

### LCN-013 — Development Module
**COMPLETE**

Added 7 structured development tools:

- `detect_project`
- `detect_build_system`
- `project_info`
- `install_dependencies`
- `run_build`
- `run_tests`
- `run_lint`

Tool catalog increased from 63 to 70. Long-running development actions reuse the existing managed process-session registry and passed disposable Node project tests on CI.

### LCN-014 — HTTP Client
**COMPLETE**

Added 4 bounded HTTP tools:

- `http_request`
- `http_probe`
- `http_headers`
- `http_download`

Tool catalog increased from 70 to 74. Local HTTP fixture tests and Windows CI passed.

### LCN-015 — Log Tail
**COMPLETE**

Added 5 bounded log tools:

- `tail_file`
- `follow_log`
- `read_log_events`
- `search_log`
- `stop_log_follow`

Tool catalog increased from 74 to 79. Cursor-based append/truncate/rotation fixture tests passed CI.

### LCN-016 — File Watcher
**COMPLETE**

Added 4 bounded file watcher tools:

- `watch_path`
- `watch_events`
- `watch_status`
- `stop_watch`

Tool catalog increased from 79 to 83. Windows backend uses .NET `System.IO.FileSystemWatcher` after native Node/libuv watcher crashes were reproduced on CI; final watcher fixture suite passed.

### LCN-017 — Scheduled Tasks
**COMPLETE**

Added 8 structured Windows Scheduled Task tools:

- `list_scheduled_tasks`
- `get_scheduled_task`
- `create_scheduled_task`
- `run_scheduled_task`
- `stop_scheduled_task`
- `enable_scheduled_task`
- `disable_scheduled_task`
- `delete_scheduled_task`

Tool catalog increased from 83 to 91. Disposable Task Scheduler lifecycle acceptance passed on Windows CI.

### LCN-025 — Managed Session Completion
**COMPLETE**

Added long-running AI operation lifecycle/hygiene primitives:

- `wait_session`
- `release_session`
- `prune_sessions`
- `refresh_state`
- optional `start_process.label`
- offline `Refresh-LConnect.cmd/.ps1`

Process terminal state now follows process exit, while `streams_closed` reports output-pipe drain separately. Soft refresh preserves active work; offline Refresh requires LConnect stopped and clears generated runtime/log state only.

### LCN-026 — Incremental Process Output Cursor
**COMPLETE**

Added:

- `read_process_events`

Process stdout/stderr/lifecycle evidence now has monotonic cursor semantics, bounded memory and explicit overflow reporting. Existing `read_process_output` remains compatible.

Tool catalog increased from 91 to 96. GitHub Actions run `35754500025` passed.

### LCN-031 — MCP Request Timeout Containment
**COMPLETE**

Added transport-facing timeout containment without adding a new MCP channel or autonomous runtime:

- configurable `mcp.maxSynchronousRequestSeconds` (default 15 seconds)
- `LCONNECT_MAX_SYNCHRONOUS_REQUEST_SECONDS` override
- synchronous child-process operations capped to the configured budget
- timeout returns no longer depend on child `close` after the deadline
- `wait_session` defaults to a short bounded wait and reports `waited_ms` / `return_reason`
- managed `start_process` work continues independently of a short wait timeout
- HTTP deadlines cover body/download consumption, not only response headers
- shell tool descriptions direct long-running work to managed sessions

TDD evidence:

- RED run `35881634042`: FAIL at Runtime smoke tests before implementation
- GREEN run `35881996747`: PASS for syntax, full Runtime smoke tests and dependency audit

This reduces LConnect-originated long response stalls. It does not claim to control or eliminate ChatGPT frontend/backend message-delivery timeouts.

### LCN-032 — HTTP Hard-Settle Timeout + Delivery Evidence
**COMPLETE**

Strengthened HTTP timeout containment after live connector testing revealed that ChatGPT/Tunnel delivery could arrive later than the LConnect-local timeout result.

Changes:

- HTTP deadline now hard-settles the MCP-facing handler through an outer timeout race
- underlying fetch/body work is still aborted
- late abort rejection is contained
- timeout/error results expose:
  - `timeout_requested_ms`
  - `timeout_effective_ms`
  - `timeout_capped`
  - `handler_elapsed_ms`
  - `deadline_elapsed_ms`
  - `completed_at`
- timeout regression threshold was tightened so a 1-second budget cannot pass by waiting for the full 3-second delayed body

Implementation commit: `06a246be0ac41855344504288ab64e7a7f5e2a0c`

GitHub Actions run `35888912101`: PASS.

The remaining observed delay between LConnect-local completion and live ChatGPT receipt is downstream transport/tool-delivery latency rather than LConnect HTTP execution.

## Next sequence

```text
LCN-007 Environment — COMPLETE
  ↓
LCN-008 Process Advanced — COMPLETE
  ↓
LCN-009 Windows Services — COMPLETE
  ↓
LCN-010 Port / Network — COMPLETE
  ↓
LCN-011 Hardware — COMPLETE
  ↓
LCN-012 Git — COMPLETE
  ↓
LCN-013 Development — COMPLETE
  ↓
LCN-014 HTTP Client — COMPLETE
  ↓
LCN-015 Log Tail — COMPLETE
  ↓
LCN-016 File Watcher — COMPLETE
  ↓
LCN-017 Scheduled Tasks — COMPLETE
  ↓
LCN-025 Managed Session Completion — COMPLETE
  ↓
LCN-026 Incremental Process Output Cursor — COMPLETE
  ↓
LCN-031 MCP Request Timeout Containment — COMPLETE (priority repair)
  ↓
LCN-032 HTTP Hard-Settle Timeout + Delivery Evidence — COMPLETE
  ↓
LCN-027 Structured Text Search — READY
  ↓
LCN-028 File Integrity — PLANNED
  ↓
LCN-029 Exact Git Ref / Ancestry Safety — PLANNED
  ↓
LCN-030 GitHub Actions / Release Integration — PLANNED
  ↓
LCN-018 Clipboard — PLANNED
  ↓
LCN-019 Window Control
  ↓
LCN-020 Keyboard / Mouse
  ↓
LCN-021 Browser Common Layer
  ↓
LCN-022 Firefox Adapter
  ↓
LCN-023 Chrome Adapter
```

## Planned reliability phase

Detailed plan:

[AGENT_OPERATIONS_RELIABILITY_PLAN.md](AGENT_OPERATIONS_RELIABILITY_PLAN.md)

Scope is intentionally limited to six capability groups: LCN-025–030. Event Log, archive, registry and additional desktop/system extras are not part of this phase.

## Current known constraints

- Tool calls that block too long can be cut by an upstream caller timeout; long-running work should use session/job-style patterns.
- `/readyz` is not proof that stdio MCP RPC is healthy.
- tunnel configuration remains local-only and must never be committed.
- Browser automation must not depend on Edge.
- Firefox is the primary browser target; Chrome is secondary.

### LCN-024 — First-run Installation Guide + v1.1.0 Release
**COMPLETE**

Rewrote the Thai first-run installation guide as a detailed step-by-step walkthrough, corrected installer/launcher onboarding copy, bumped LConnect to 1.1.0 and published the 91-tool feature release.

- candidate: `0cefe3beede022f7477fa6ab54740571c7e92b8c`
- CI: `35518059146` PASS
- tag: `v1.1.0`
- release asset: `LConnect-v1.1.0-Expanded-Tools.zip`
- SHA-256: `A91DEADAB210C3B9E5D346D0A015407317042B747CDE43B2519612217BAC7C31`