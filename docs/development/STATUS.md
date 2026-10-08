# STATUS — LConnect Development

Last updated: 2026-10-02

## Overall

Current project state: **BASIC CORE STABLE / v1.3.0 PUBLISHED / DEPLOYED / LIVE GREEN / LCN-058 COMPLETE**

Current published release: **v1.3.0 — Desktop & Browser Automation**

Release tag target: `3e685ba0596bf00b9e4546c0dc8d9293fbdbd761`

Release CI: `37009797481` / #171 — PASS

Current source version: **1.3.0**

Current main/source MCP catalog: **154 tools**

Current installed/running MCP catalog baseline: **154 tools / 1.3.0**. Process IDs are volatile runtime evidence and must be read live from `runtime_catalog` rather than treated as durable documentation.

Current running catalog digest: `2ca33225b970dd70e1350d7b4e3d9290116448181031872d643111ae7ab4c374`

v1.3.0 release-activation evidence: **1.3.0 / 154 tools / PID 17900**, catalog digest `2ca33225b970dd70e1350d7b4e3d9290116448181031872d643111ae7ab4c374`, duplicate public tool names: none, release source↔installed parity **247/247 exact**. The PID is historical qualification evidence; read live PID from `runtime_catalog`.

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

Agent Operations Reliability LCN-025–030 ปิดครบ, Delivery/Turn Reliability LCN-031–039 และ LCN-046–050 ปิดที่ current evidence boundary โดยยังคง observation-only/no-blocking, Execution Ergonomics LCN-040–044 ปิดที่ current need; Desktop Control LCN-018–020 COMPLETE และ Browser Automation LCN-021–023 + LCN-054 COMPLETE AT CURRENT SCOPE / DEPLOYED / LIVE GREEN

## Workstream status

| Workstream | Status | Task range | Notes |
|---|---|---:|---|
| Core / Tunnel | COMPLETE | LCN-001–006 | Baseline + recovery + coordination |
| System Foundation | COMPLETE | LCN-007–011 | Environment + Process + Services + Network + Hardware complete |
| Developer Foundation | COMPLETE | LCN-012–014 | Git + Development + HTTP complete |
| Observation | COMPLETE | LCN-015–017 | Log Tail + File Watcher + Scheduled Tasks complete |
| Agent Operations Reliability | COMPLETE | LCN-025–034 | LCN-025–030 and LCN-031–034 complete |
| Delivery / Turn Reliability | COMPLETE AT CURRENT EVIDENCE | LCN-031–039, LCN-046–050 | LCN-050 live GREEN: first post-Confirm work tool auto-starts next round; `github_run_wait` returns compact status only, with live result 832 bytes vs ~63 KB pre-fix waits |
| Execution Ergonomics | COMPLETE AT CURRENT NEED | LCN-040–044 | LCN-044 Deployment Verification Snapshot PASS on installed tree; 178/178 tracked parity, runtime 1.2.0 / 120 tools |
| Local Credential / Self-Restart | COMPLETE | LCN-052 | DPAPI CurrentUser credential + ACL + detached restart remain live GREEN; v1.2.2 release baseline was 122 tools and the feature is retained in current main/runtime 154-tool catalog |
| Desktop Control | COMPLETE | LCN-018–020 | Clipboard, Window Control, and Keyboard/Mouse complete/live GREEN |
| Browser Automation | COMPLETE AT CURRENT SCOPE | LCN-021–023, LCN-054 | Managed Firefox/Chrome + browser hardening + live UIA safety boundary deployed/live GREEN; runtime catalog 154 tools |
| Tool Surface Normalization | COMPLETE / LIVE GREEN | LCN-055 | 154-tool canonical/compatibility/deprecation metadata, catalog guards, filesystem bounds/tests, maintainable test runner |
| v1.3.0 Release | COMPLETE / PUBLISHED / LIVE GREEN | LCN-056 | Desktop + Browser + Live UIA release; exact commit `3e685ba...`; CI #171; runtime baseline 1.3.0 / 154 tools |
| Security / Operational Hygiene | COMPLETE / DEPLOYED / LIVE GREEN | LCN-057 | SDK 1.32.1 + proxy-addr 2.0.8, bounded search traversal, session-registry hygiene, Windows managed batch launch, lifetime telemetry aggregate, idle round rollover; CI #175 |
| Optional AtLogOn Persistence | COMPLETE / DEPLOYED / PHYSICAL GREEN | LCN-058 | opt-in current-user AtLogOn task; SID-normalized identity; idempotent install/repair/remove; default task remains absent; CI #178 |

### LCN-056 — v1.3.0 Desktop & Browser Automation Release
**COMPLETE / PUBLISHED / DEPLOYED / LIVE GREEN**

Published the 154-tool backward-compatible feature release containing Desktop Control, managed Firefox/Chrome automation, live Windows UI Automation, browser safety hardening and LCN-055 tool-surface normalization.

- exact release commit: `3e685ba0596bf00b9e4546c0dc8d9293fbdbd761`
- CI: #171 / run `37009797481` — SUCCESS
- annotated tag object: `ef06f0eab103acab6f54fabd981278e2f809199d`
- release-qualification runtime: **1.3.0 / 154 tools / PID 17900** (historical PID evidence)
- release deployment parity: **247/247 exact**
- managed Firefox/Chrome physical: PASS
- installed live UIA Thai/Unicode type/click/snapshot: PASS
- clean install + overlay preservation: PASS
- published assets: 12
- downloaded-back hash mismatches: 0
- v1.2.2 tag/release remained unchanged

Report: [reports/LCN-20261002-056-v1.3.0-desktop-browser-automation-release.md](reports/LCN-20261002-056-v1.3.0-desktop-browser-automation-release.md)

### LCN-055 — Tool Surface Cleanup & Contract Normalization
**COMPLETE / DEPLOYED / LIVE GREEN**

Normalized the mature 154-tool public surface without reducing capability:
- central tool registry/metadata: 152 canonical, 1 compatibility, 1 deprecated
- exact source catalog == MCP tools/list guard
- duplicate-name detection: none
- direct filesystem regression suite with Unicode/Thai and bounded output
- auto-discovered syntax/test runners
- current-vs-release documentation drift guard
- large clipboard transport repaired to use stdin rather than command-line payloads

Implementation: `885229e72380882aa6239996d0647a33e4148400`
CI: #167 / run `37003411662` — SUCCESS
Deployment: 245/245 tracked exact
Live runtime: 1.2.2 / PID 4704 / 154 tools / no duplicates
Credential SHA-256 remained `b773cace3931586913b84460c4b00cbd1ce33b78a165fa77355e259470cf2665`.

Report: [reports/LCN-20261002-055-tool-surface-cleanup-contract-normalization.md](reports/LCN-20261002-055-tool-surface-cleanup-contract-normalization.md)

### LCN-054 — Browser Control Hardening & Live Safety Boundary
**COMPLETE / DEPLOYED / LIVE GREEN**

Completed hardening of the Browser Common/Firefox/Chrome stack and added a separate live-browser Windows UI Automation safety domain.

Delivered:
- isolated managed profiles by default with explicit external-profile opt-in
- reserved profile/debugging argument guards
- truthful profile ownership/isolation/cleanup metadata
- attached stop = detach by default; remote close explicit
- Firefox `none` / `interactive` / `complete` wait semantics
- Chrome CDP Input click/type
- DOM live state + explicit accessibility snapshots
- file-backed screenshot default + SHA-256
- managed cleanup evidence and Firefox profile-bound process residue cleanup
- 6 live-browser tools that do not enable WebDriver/CDP or access the normal browser profile

Implementation commits:
- `e4612e4497469596551b77a1c6eb763888519e13`
- `0b139a18f6f303025635039f912f3ee16c74eb05`

Exact-commit CI:
- #164 / run `36995259635`: SUCCESS
- #165 / run `36997595480`: SUCCESS

Final implementation runtime:
- version/catalog: **1.2.2 / 154 tools**
- qualification PID at LCN-054 closure: `9356` (historical); current live PID at LCN-055 activation: `12736`
- catalog digest: `2ca33225b970dd70e1350d7b4e3d9290116448181031872d643111ae7ab4c374`
- source/install implementation parity: **236/236 exact**
- manifest digest: `45396e29b88ead2c587835f6993dfcc96f9a3e5e13557fa009f576f993b4e82d`
- preserved local paths: **6/6**
- installed Firefox physical: PASS, `browser_residue=0`
- installed Chrome physical: PASS
- installed live Firefox UIA: PASS, detach-only, process untouched

The existing v1.2.2 annotated tag remains immutable and still peels to release commit `fcf3d75c6314706e3258b6c5d1345b6f637ac78f`.

### LCN-053 — v1.2.2 Secure Restart & Local Credentials Release
**COMPLETE**

Published and verified v1.2.2 / 122 tools from exact release commit `fcf3d75c6314706e3258b6c5d1345b6f637ac78f`. CI #146 passed, source↔installed parity reached 212/212 exact, DPAPI credential/self-restart remained GREEN after activation, and all 11 release assets passed downloaded-back SHA-256 verification.

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

LCN-034 completion evidence (historical):

- catalog at that task: 98 tools
- targeted batch tests: PASS
- full local suite: PASS
- dependency audit: 0 vulnerabilities
- GitHub CI `35960766521`: PASS


### LCN-051 — v1.2.1 Current Reliability Release
**COMPLETE**

Published and verified v1.2.1 / 122 tools from exact release commit `5d3c7e5381b1efd188a8f175612f67ee94fe3c86`. CI #138 passed, source↔installed parity reached 197/197 exact, the activated runtime reports 1.2.1 / 122 tools, dependency audit is 0 vulnerabilities, and all release program/documentation/checksum assets were verified after publication.

### LCN-052 — Secure Local Credential Persistence & Self-Restart
**ACTIVE**

Implementing a local-only encrypted credential file under `local-secrets/` using Windows DPAPI / CurrentUser, deterministic credential resolution for non-interactive start, first-run setup/status/clear commands, and a detached restart worker that can stop and start LConnect without placing the Runtime API key on a command line.

Catalog target remains **122 tools**; no new MCP tool is required.

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
LCN-040–044 Execution Ergonomics — COMPLETE AT CURRENT NEED
  ↓
LCN-045 v1.2.0 Documentation & Release — COMPLETE
  ↓
LCN-046–050 Turn-Risk / Retry Reliability — COMPLETE AT CURRENT EVIDENCE
  ↓
LCN-051 v1.2.1 Current Reliability Release — COMPLETE
  ↓
LCN-052 Secure Local Credential Persistence & Self-Restart — COMPLETE
  ↓
LCN-018 Clipboard — COMPLETE
  ↓
LCN-019 Window Control — COMPLETE
  ↓
LCN-020 Keyboard / Mouse — COMPLETE
  ↓
LCN-021 Browser Common Layer — COMPLETE
  ↓
LCN-022 Firefox Adapter — COMPLETE
  ↓
LCN-023 Chrome Adapter — COMPLETE
```

## Completed Agent Operations Reliability plan

Detailed plan:

[AGENT_OPERATIONS_RELIABILITY_PLAN.md](AGENT_OPERATIONS_RELIABILITY_PLAN.md)

The original six capability groups LCN-025–030 are complete. Follow-up delivery/turn reliability LCN-031–039 is also complete at the current local evidence boundary; Execution Ergonomics LCN-040–044 is complete at current need.

## Current known constraints

- Tool calls that block too long can be cut by an upstream caller timeout; long-running work should use session/job-style patterns.
- Repeated long polling inside one assistant turn correlated with user-visible message-delivery timeout; LCN-031–039 now provide bounded waits, telemetry and local delivery evidence, so avoid returning to repeated long polling unless new evidence warrants reopening that workstream.
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