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

# Phase 4C — User-Confirmed Adaptive Turn Latency Budget — COMPLETE AT CURRENT NEED

LCN-046 adds a round-scoped guard for retry-prone tool sequences.

Key rules:

- calibration retry is confirmed manually with `SetMaxLatency-LConnect.cmd`
- active budget uses only the confirmed current round
- historical rounds are audit-only
- new rounds start from zero
- after calibration the AI starts each new user-turn round with `latency_round_start`
- no request-ID or idle-time turn inference
- preflight returns `ROUND_NOT_STARTED` or `LATENCY_BUDGET_EXCEEDED` before work-handler execution when applicable

Closure evidence: ChatGPT reconnect exposed all 122 tools; direct `latency_budget_status` and `latency_round_start` both passed; a fresh direct round began at zero without historical carry-over.

Post-closure evidence from a real user-confirmed Retry showed that the handler-sum-based adaptive ceiling is not a valid proxy for end-to-end Retry risk: failed round 6 lasted ~563.973 s wall-clock while completed handler time summed to only ~36.899 s. The explicit round boundary remains useful, but handler-sum ENFORCE semantics are superseded by LCN-047.

# Phase 4D — Turn-Risk Telemetry Model Repair — COMPLETE AT CURRENT EVIDENCE

LCN-047 converts the LCN-046 mechanism into observation-only round telemetry. It separates explicit-round wall-clock, handler time, observed idle gaps, result volume, errors/timeouts and in-flight state, and captures user-confirmed Retry snapshots without creating or enforcing a speculative latency ceiling.

The MCP catalog remains 122 tools; existing direct tool names are retained for compatibility.

Closure: primary commit `70bfa9412d13a1f1e9a77c1a5b870ba3c84622d2` / CI #128 PASS, migration corrective commit `708c75a961cfd2b1a41c10cb4c8c8d175b11b1ec` / CI #129 PASS, installed/runtime live GREEN at 122 tools. Future real Retry events are captured as observation snapshots with `ConfirmRetry-LConnect.cmd`; no handler-sum-derived enforcement is active.

# Phase 4E — Retry Tail-Gap Telemetry Refinement — COMPLETE AT CURRENT EVIDENCE

LCN-048 was opened from a second real user-confirmed Retry after LCN-047 deployment. It adds explicit `tail_idle_ms` and `max_observed_gap_ms` so the terminal quiet period after the final LConnect call is visible as a first-class observation. It does not add prediction or enforcement.

Closure: primary commit `ec62ae32efa9f8a8f63f25ffd6d2ed774d27daaa` / CI #131 PASS, legacy-snapshot corrective commit `04cee51b61cf109c9353c1febb127348ea377c8d` / CI #132 PASS, installed/runtime live GREEN at 122 tools. Pre-LCN-048 Retry snapshots retain unknown new fields as null/none; future confirmed Retries persist tail-gap evidence directly.

# Phase 4F — Remove Legacy MaxLatency Compatibility Surface — COMPLETE

LCN-049 removes the obsolete public compatibility surface left from the superseded LCN-046 adaptive MaxLatency model. Current operational commands are `ResetRound-LConnect.cmd`, `ConfirmRetry-LConnect.cmd`, and `StatusTurnRisk-LConnect.cmd`; only `ConfirmRetry-LConnect.cmd` confirms Retry events.

Historical LCN-046–048 task/report records remain as audit evidence and are not current operational instructions.

Closure: implementation commit `e39c6575e32ba73232aac84437ec03a40619db0a` / CI #134 PASS, installed cleanup GREEN at 193 tracked files, and direct runtime remains 1.2.0 / 122 tools. MaxLatency wrappers/actions/controller aliases are removed.

# Phase 4G — Post-Retry Auto-Round and GitHub Wait Payload Containment — COMPLETE AT CURRENT EVIDENCE

LCN-050 is driven by a new real Retry after LCN-049. It repairs the lifecycle gap where `ConfirmRetry-LConnect.cmd` left the round in `confirmed_retry` and all later work ran untracked until an explicit round-start call. The first subsequent non-control work tool now auto-starts the next round and is recorded as call 1.

The same incident showed 98 `github_run_wait` calls returning ~5.64 MB after the previous Confirm. `github_run_wait` is therefore changed to query/return compact top-level run status only; `github_run_view` remains the explicit full jobs/steps surface.

No timeout threshold or automatic blocking is introduced.

Closure: implementation commit `b36f8c5b595ddf4f5d3483eabc8c674e4263c714` / CI #136 PASS; installed source parity 195/195; real persisted round 20 transitioned to round 21 automatically on the first work call; live compact `github_run_wait` returned 832 bytes with no jobs/steps; clean round 22 started after validation.

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

## LCN-054 Browser Control Hardening & Live Safety Boundary

Harden the completed LCN-021–023 browser stack without changing the immutable v1.2.2 release:

- managed Firefox/Chrome default to isolated temporary profiles
- external profile roots require explicit unsafe opt-in
- reserved profile/debugging arguments are blocked
- attached sessions detach by default and remote close is explicit
- profile ownership/isolation/cleanup metadata must be truthful
- navigation wait semantics must represent actual behavior
- Chrome interaction uses CDP Input for higher-fidelity click/type
- snapshot exposes DOM live state and accessibility mode
- screenshot defaults to file + SHA-256 instead of large inline base64
- managed stop surfaces process/profile cleanup evidence
- live browser control is a separate Windows UI Automation domain with no WebDriver/CDP or profile access
- live mode adds `browser_live_attach/tabs/snapshot/click/type/stop`

LCN-054 increases the current source catalog to **154 tools** while leaving v1.2.2 tag/release unchanged.

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

# Phase 4H — v1.2.1 Current Reliability Release — COMPLETE

LCN-051 publishes the post-v1.2.0 mainline as **v1.2.1 — Turn-Risk & Retry Reliability** with the current **122-tool** catalog.

Release scope:

- LCN-046–050 reliability work
- observation-only `turn_risk_observation_v2`
- Retry tail-gap evidence and post-Confirm automatic round start
- compact `github_run_wait` status payloads
- removal of obsolete MaxLatency operational surface
- current-facing documentation refresh
- smartphone ChatGPT Web usage path
- `Error in input stream` troubleshooting note that distinguishes stream/delivery failure from local execution state

The program archive must be built from one exact release commit, validated by exact-commit CI, deployed to the installed tree, activated as 1.2.1 / 122 tools, and published with documentation bundle + SHA-256 manifest.

Closure: release commit `5d3c7e5381b1efd188a8f175612f67ee94fe3c86`; CI #138 / run `36850514776` PASS; installed/runtime **1.2.1 / 122 tools**; 197/197 tracked parity at activation; dependency audit 0 vulnerabilities; program/documentation/checksum assets published and downloaded-back hash verified.

# Phase 4I — Secure Local Credential Persistence & Self-Restart — COMPLETE

LCN-052 adds persistent local credential handling without storing the Runtime API key as plaintext and without requiring an external credential manager.

Design:

- `local-secrets/credentials.json.enc`
- Windows DPAPI / `CurrentUser`
- restricted ACL for current Windows user + SYSTEM
- parameter > environment > stored DPAPI > interactive precedence
- first interactive start can save the credential
- non-interactive missing credential fails deterministically
- detached restart worker uses only the local encrypted credential and never passes the Runtime API key on its command line
- `local-secrets/` is Git-ignored and preserved through refresh/deployment
- no restart loop and no new MCP catalog entry; expected catalog remains 122

Closure: CI #144 / run `36896931112` PASS at exact commit `20ccdae5deeb3c70b3347337e95768cad194955b`; installed tree 210/210 tracked parity; DPAPI credential decrypt/ACL/plaintext-exclusion PASS; detached live restart PASS; restarted runtime 1.2.1 / 122 tools.

# Phase 4J — v1.2.2 Secure Restart & Local Credentials Release — COMPLETE

LCN-053 packages the completed LCN-052 secure credential/self-restart work into **v1.2.2**.

Release target:

- version/tag: `1.2.2` / `v1.2.2`
- release name: **LConnect v1.2.2 — Secure Restart & Local Credentials**
- catalog: **122 tools**
- Windows DPAPI / CurrentUser encrypted local credential
- restricted local secret ACL
- first-run credential save + setup/status/clear commands
- detached non-interactive self-restart
- `local-secrets/` preserved locally and excluded from Git/release archives
- exact-commit CI, source/install parity, live activation, asset checksums and downloaded-back verification required before closure

Closure: release commit `fcf3d75c6314706e3258b6c5d1345b6f637ac78f`; CI #146 / run `36903887945` PASS; installed/runtime **1.2.2 / 122 tools**; 212/212 tracked parity; DPAPI credential + detached self-restart live GREEN; 11 release assets published and downloaded-back hash verified.

# Phase 7 — Tool Surface Normalization — COMPLETE

## LCN-055 Tool Surface Cleanup & Contract Normalization

The 154-tool current main/runtime surface is treated as a mature API rather than a tool-count target.

Delivered:
- central expected public-tool registry and metadata
- canonical / compatibility / deprecated classification
- safety/family/module/platform/long-running metadata
- deterministic source expected catalog == actual MCP catalog test
- duplicate-name runtime evidence and regression guard
- dedicated filesystem smoke coverage and bounded filesystem outputs
- maintainable syntax/test runner discovery
- current-facing documentation count guard
- explicit managed-browser vs live-browser policy
- large clipboard payload transport hardening found during full qualification

Compatibility is preserved: public tool count remains **154**.

Closure: implementation commit `885229e72380882aa6239996d0647a33e4148400`; CI #167 / run `37003411662` SUCCESS; deployed tracked parity **245/245 exact**; live runtime **1.2.2 / PID 4704 / 154 tools**, duplicate names none, encrypted credential preserved.

# Phase 8 — v1.3.0 Desktop & Browser Automation Release — COMPLETE

## LCN-056 v1.3.0 Desktop & Browser Automation Release

Published the completed Desktop Control + Browser Automation + Tool Surface mainline as the backward-compatible **v1.3.0 / 154-tool** feature release.

Qualification included:
- local full suite + PowerShell syntax + dependency audit
- exact GitHub Actions release-candidate CI
- clean install from exact git archive
- overlay/local-state preservation
- managed Firefox and Chrome physical qualification
- installed live Windows UIA Thai/Unicode type/click/snapshot qualification
- tracked-only production deployment + secure self-restart
- exact runtime/source/install parity
- annotated tag integrity
- release asset checksum manifest
- downloaded-back verification of all published assets

Release qualification caught and repaired two issues before publication:
- large real-world netstat output could exceed the generic shell capture cap before parsing
- Windows PowerShell 5.1 UIA worker stdout needed explicit UTF-8 encoding for non-ASCII result fidelity

Closure:
- exact release commit: `3e685ba0596bf00b9e4546c0dc8d9293fbdbd761`
- CI #171 / run `37009797481`: SUCCESS
- release-qualification runtime: **1.3.0 / PID 17900 / 154 tools** (historical PID evidence)
- release parity: **247/247 exact**
- tag object: `ef06f0eab103acab6f54fabd981278e2f809199d`
- published assets: 12
- downloaded-back hash mismatch: 0

Future capability work must open a new numbered task from the current GitHub/runtime baseline.

# Phase 9 — Post-v1.3.0 Operational Hardening — ACTIVE

## LCN-057 Security & Operational Hygiene — COMPLETE / DEPLOYED / LIVE GREEN

LCN-057 hardens the already-published v1.3.0 capability surface without changing its immutable release tag.

Planned/delivered implementation scope:
- patch newly disclosed high/critical dependency advisories while avoiding unrelated major upgrades
- bound recursive `search_files` by entries, depth, elapsed time, matches and output size
- bound the managed process-session registry and add filtered/paginated compact session inspection
- make Windows managed `.cmd/.bat` launch semantics consistent with synchronous command execution
- keep raw tool telemetry bounded while retaining current-runtime lifetime per-tool aggregates
- roll stale observation-only turn-risk rounds after a configurable idle period; never enforce/block
- document process IDs as volatile observations rather than durable current state

Public MCP tool count remains **154**. Closure: implementation `c949c3239cc5ede9e285dfd605b0e62392bdde4b`; CI #175 / run `37810517540` SUCCESS; deployed 249/249 exact; live runtime 1.3.0 / 154 tools / PID 15508; dependency audit 0 vulnerabilities; credential hash preserved.

## LCN-058 Optional AtLogOn Persistence — ACTIVE

Add an opt-in and removable Windows AtLogOn persistence path that starts LConnect non-interactively using the existing DPAPI CurrentUser credential. It is idempotent, does not expose credentials on a command line, is disabled by default, refuses unowned task collisions, and repairs drift only for a task carrying the matching LConnect root/user ownership marker.

## LCN-059 v1.3.1 Operational Hardening Release

Package qualified LCN-057/058 work as a patch release only after exact-commit CI, install/overlay qualification, deployment/runtime evidence, immutable tag creation, release asset checksums and download-back verification.
