# STATUS — LConnect Development

Last updated: 2026-09-24

## Overall

Current project state: **BASIC CORE STABLE / DELIVERY-TIMEOUT MITIGATION ACTIVE / EXECUTION ERGONOMICS PARALLEL**

Current published release: **v1.1.0 — Expanded Tools & First-Run Guide**

Current main/source MCP catalog: **114 tools**

Current installed/runtime MCP catalog: **113 tools** pending LCN-038 deployment

Current ChatGPT-visible MCP catalog: **112 tools** — latest UI refresh did not trigger a new `server/discover`; runtime remains 113 and is directly observable through `runtime_catalog`

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

Agent Operations Reliability ชุด LCN-025–030 ปิดครบแล้ว ปัจจุบันกลับมาเดิน latency/message-delivery mitigation ควบคู่กับ execution ergonomics โดยยังคงหลัก deterministic structured primitives และไม่ย้าย workflow ownership เข้า LConnect; Desktop/Browser automation ยังพักไว้

## Workstream status

| Workstream | Status | Task range | Notes |
|---|---|---:|---|
| Core / Tunnel | COMPLETE | LCN-001–006 | Baseline + recovery + coordination |
| System Foundation | COMPLETE | LCN-007–011 | Environment + Process + Services + Network + Hardware complete |
| Developer Foundation | COMPLETE | LCN-012–014 | Git + Development + HTTP complete |
| Observation | COMPLETE | LCN-015–017 | Log Tail + File Watcher + Scheduled Tasks complete |
| Agent Operations Reliability | COMPLETE | LCN-025–034 | LCN-025–030 and LCN-031–034 complete |
| Delivery / Turn Reliability | ACTIVE | LCN-031–038 | LCN-038 structured delivery correlation implementation in progress |
| Execution Ergonomics | ACTIVE | after LCN-030 | Deterministic structured primitives only; no agent/workflow runtime |
| Desktop Control | DEFERRED | LCN-018–020 | Explicitly paused |
| Browser Automation | DEFERRED | LCN-021–023 | Explicitly paused |

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

### LCN-033 — General MCP Tool Delivery Telemetry
**COMPLETE**

Adds metadata-only timing telemetry at the common MCP tool-registration boundary.

Current local candidate:

- catalog: 97 tools
- targeted telemetry tests: PASS
- full suite rerun: PASS
- dependency audit: 0 vulnerabilities
- GitHub CI `35958925520`: PASS

No tool arguments or result contents are recorded.

### LCN-027 — Structured Text Search
**COMPLETE**

Added:

- `search_text`

Structured UTF-8 content search now supports literal/regex matching, case modes, include/exclude patterns, context, Unicode/Thai-safe line/column evidence, binary/error reporting and hard files/bytes/matches/output bounds. The tool is also available inside the bounded read-only `batch_inspect` allowlist.

Implementation: `0b91d8a2b1a94fa3e18a5c340ab1cd4da161591d`

GitHub Actions run `35963995356`: PASS.

Catalog increased from 98 to 99 tools.

### LCN-028 — File Integrity
**COMPLETE**

Added:

- `file_hash`
- `compare_files`

Files are hashed through bounded streaming with SHA-256 as the default. Results include cryptographic digest evidence plus before/after stability metadata and restricted real-path enforcement. Both tools are available through the bounded read-only `batch_inspect` allowlist.

Implementation: `f813bda063efde3efe4f278cfd4cd357d60744bc`

GitHub Actions run `35964536298`: PASS.

Catalog increased from 99 to 101 tools.

### LCN-029 — Exact Git Ref / Ancestry Safety
**COMPLETE**

Added:

- `git_remote_ref`
- `git_is_ancestor`
- `git_push_ref`

Exact ref identity, resolved ancestry evidence and non-force fast-forward-safe explicit ref push are now available without raw Git parsing. The LCN-029 review also removed mutating `git_branch` from the read-only `batch_inspect` allowlist and added a regression proving branch creation cannot execute through batch.

Implementation: `f003d526f0b160587c1be7a2d80a765a0850ceec`

GitHub Actions run `35965366927`: PASS.

Catalog increased from 101 to 104 tools.

### LCN-030 — GitHub Actions / Release Integration
**COMPLETE**

Added:

- `github_run_list`
- `github_run_view`
- `github_run_wait`
- `github_run_failed_logs`
- `github_workflow_dispatch`
- `github_release_view`
- `github_release_download`

The module reuses authenticated `gh`, keeps Git tools independent, bounds wait/log/download behavior, redacts secret-like output, and does not expose generic GitHub project mutation.

Implementation: `ba740c75ed29d2b14b52a42c88db448e159d0488`

GitHub Actions run `35966485027`: PASS.

Catalog increased from 104 to 111 tools.

A user-visible message-delivery timeout occurred while the already-running CI watcher continued normally and completed PASS. Evidence is recorded in `reports/LCN-20260924-message-delivery-timeout-observation.md`; no new latency task was opened because that workstream is deferred.

### LCN-034 — Bounded Read-Only Batch Inspection
**COMPLETE**

Adds one bounded deterministic read-only batch tool:

- `batch_inspect`

Purpose:

- reduce accumulated MCP round trips
- keep ChatGPT as the intelligence/workflow owner
- preserve existing tool validation/semantics
- enforce a strict read-only allowlist
- bound per-result and total output

Current local candidate:

- catalog: 98 tools
- targeted batch tests: PASS
- full local suite: PASS
- dependency audit: 0 vulnerabilities
- GitHub CI `35960766521`: PASS

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
LCN-033 General MCP Tool Delivery Telemetry — COMPLETE
  ↓
LCN-034 Bounded Read-Only Batch Inspection — COMPLETE
  ↓
LCN-027 Structured Text Search — COMPLETE
  ↓
LCN-028 File Integrity — COMPLETE
  ↓
LCN-029 Exact Git Ref / Ancestry Safety — COMPLETE
  ↓
LCN-030 GitHub Actions / Release Integration — COMPLETE
  ↓
Execution Ergonomics — NEXT
  ↓
LCN-018 Clipboard — DEFERRED
  ↓
LCN-019 Window Control — DEFERRED
  ↓
LCN-020 Keyboard / Mouse — DEFERRED
  ↓
LCN-021 Browser Common Layer — DEFERRED
  ↓
LCN-022 Firefox Adapter — DEFERRED
  ↓
LCN-023 Chrome Adapter — DEFERRED
```

## Planned reliability phase

Detailed plan:

[AGENT_OPERATIONS_RELIABILITY_PLAN.md](AGENT_OPERATIONS_RELIABILITY_PLAN.md)

Scope is intentionally limited to six capability groups: LCN-025–030. Event Log, archive, registry and additional desktop/system extras are not part of this phase.

## Current known constraints

- Tool calls that block too long can be cut by an upstream caller timeout; long-running work should use session/job-style patterns.
- Repeated 10-second polling inside one long assistant turn has now correlated with a user-visible message-delivery timeout even though LConnect/tunnel responses remained healthy; avoid that polling pattern while latency work is deferred.
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