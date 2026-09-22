# LConnect Design Decisions

This file records decisions that future sessions should preserve unless there is new evidence strong enough to reopen them.

---

## D-001 — One main MCP channel

**Decision:** Keep ordinary LConnect capabilities behind the existing `main` MCP channel.

**Why:** ChatGPT tool discovery becomes simpler and modules can grow without tunnel topology churn.

---

## D-002 — Modular Core

**Decision:** Capabilities are modules registered into `lconnect-mcp.mjs`.

**Why:** New capability should not require redesigning tunnel/bootstrap.

---

## D-003 — Full-machine access by default

**Decision:** Filesystem access defaults to all paths available to the Windows account running LConnect.

**Why:** The intended use is local development/administration, not a strict sandbox.

**Boundary:** LConnect does not bypass Windows ACL/UAC.

---

## D-004 — Tunnel configuration is local-only

**Decision:** Never commit Tunnel ID, `mcp-conf.yaml`, Runtime API key or organization-specific secrets.

**Why:** Source distribution and tunnel ownership must stay independent.

---

## D-005 — tunnel-client minimum 0.0.14

**Decision:** LConnect requires OpenAI tunnel-client `0.0.14` or newer.

**Why:** Runtime evidence on 0.0.12 showed response-deadline failure followed by repeated `502 client_internal` for `tools/call` and `initialize`. Newer stdio recovery fixed the observed failure class.

---

## D-006 — /readyz is not MCP proof

**Decision:** Treat `/readyz` as startup readiness only.

**Why:** A tunnel-client process can be live/ready while stdio RPC is broken.

---

## D-007 — Long operations use session/job patterns

**Decision:** Avoid holding one MCP request open for long-running work when a session/job abstraction is practical.

**Why:** Caller-side tool timeouts can occur before LConnect's configurable command timeout.

---

## D-008 — System/Development foundation before GUI automation

**Decision:** Build Environment, Process, Services, Network, Hardware, Git and development primitives before deep Desktop/Browser automation.

**Why:** They provide greater reliability/value per implementation effort and reduce debugging ambiguity later.

---

## D-009 — Firefox is primary browser

**Decision:** Firefox is first-class and primary browser backend.

**Backend direction:** WebDriver BiDi; geckodriver/Marionette where useful.

**Why:** Primary user workflow uses Firefox.

---

## D-010 — Chrome is secondary browser

**Decision:** Support Chrome as a second first-class backend through CDP.

**Why:** Useful for development/debugging and cross-browser testing.

---

## D-011 — Edge is not required

**Decision:** Do not make Microsoft Edge a dependency or baseline for initial browser automation.

**Why:** It is not part of the intended primary workflow.

---

## D-012 — Browser API above backend adapters

**Decision:** User-facing browser tools should share a common session API; Firefox and Chrome specifics stay behind adapters or explicit backend-specific escape hatches.

**Why:** Calling code should not need to rewrite workflows for every browser.

---

## D-013 — Input automation is fallback, not DOM strategy

**Decision:** Browser DOM interaction should prefer browser protocols. Keyboard/mouse coordinates are for desktop interaction and fallback cases.

**Why:** DOM/protocol automation is more deterministic than screen-coordinate automation.

---

## D-014 — Environment scope and secret-safe defaults

**Decision:** Environment tools distinguish `process`, `user`, and `machine` scopes explicitly.

**Decision:** `env_list` hides values by default; callers must request `include_values: true` to bulk-read values.

**Decision:** `env_set(..., value=null)` means delete.

**Why:** Scope ambiguity can cause persistent machine changes when only temporary process changes were intended, and bulk environment values often contain credentials/tokens.

**Persistence rule:** User/machine changes apply to future processes; existing processes are not treated as automatically updated.

---

## D-015 — Process identity uses PID + creation time

**Decision:** PID alone is insufficient for destructive or waiting process operations.

**Rule:** `wait_process` and `restart_process` use `PID + creation_time` as identity evidence and report PID reuse as an identity mismatch.

**Decision:** `restart_process` requires explicit relaunch `program + args`; it does not parse or guess the original Windows command line.

**Decision:** `wait_process` is bounded per call instead of waiting indefinitely.

**Why:** Windows can reuse PIDs, original command lines are not safely reversible into argv in a generic way, and long blocking MCP calls are vulnerable to upstream caller timeouts.

---

## D-016 — Windows service mutations use exact service Name

**Decision:** Service lifecycle/startup mutations resolve one exact Windows service `Name` before acting.

**Decision:** Display-name and wildcard matching are not accepted as destructive identities.

**Why:** Windows service display names are user-facing and wildcard-capable APIs can unintentionally target more than one service.

**Testing rule:** Local development remains read-only for service lifecycle; mutation acceptance uses a disposable service on CI with cleanup.

---

## D-017 — Network endpoint enumeration uses lightweight netstat parsing

**Decision:** TCP/UDP endpoint enumeration uses `netstat.exe -ano` plus a structured parser as the Windows baseline.

**Decision:** `Get-NetTCPConnection` is not the default enumeration path.

**Why:** Runtime acceptance on the operator machine previously observed excessive memory pressure/OOM from `Get-NetTCPConnection`. The netstat path has proven lightweight and reliable in LConnect acceptance tests.

**Testing rule:** Network smoke tests use local TCP/UDP fixtures and loopback/DNS localhost so CI does not depend on external internet.

---

## D-018 — Hardware diagnostics never fabricate unavailable telemetry

**Decision:** Hardware tools are read-only diagnostics and must distinguish observed, fallback and unavailable telemetry.

**Decision:** Missing GPU/battery/storage-health data is represented explicitly rather than inferred.

**Decision:** `storage_health` reports its evidence source; `Win32_DiskDrive.Status` fallback is not presented as detailed SMART telemetry.

**Why:** Hardware data availability varies by firmware, driver, VM, storage controller and device class. Unknown is preferable to a misleading value.

---

## D-019 — Git mutations are explicit and non-force by default

**Decision:** Git tools require an explicit repository path and use direct argv execution.

**Decision:** Commit staging is explicit (`paths`, `all`, or pre-staged index).

**Decision:** Pull is fast-forward-only by default.

**Decision:** Force push is intentionally absent from the first Git contract; destructive branch/worktree force behavior requires an explicit force option where supported.

**Why:** Repository automation should preserve exact intent and make mutation boundaries visible rather than relying on hidden CLI state or aggressive defaults.

---

## D-020 — Development operations reuse the managed process-session registry

**Decision:** Long-running development actions reuse the same managed process-session registry as `start_process`.

**Decision:** Development tools return a `session_id` rather than blocking one MCP call until build/test/install completes.

**Decision:** Ecosystem detection may be broader than execution support; unsupported ecosystems are reported explicitly instead of guessing commands.

**Why:** This preserves one lifecycle model for long-running work, avoids duplicate job registries, and reduces exposure to upstream caller timeouts.

---

## D-021 — HTTP bodies and downloads are bounded

**Decision:** HTTP response bodies are bounded and report truncation explicitly.

**Decision:** Timeout and redirect behavior are explicit request parameters.

**Decision:** Downloads use a temporary file followed by rename, enforce a maximum byte count, do not overwrite by default, and obey LConnect filesystem scope.

**Why:** Remote endpoints can be slow, redirect unexpectedly, or return arbitrarily large data. HTTP tooling must not turn those conditions into unbounded MCP memory/output or partial destination files.

---

## D-022 — Observation sessions use cursors and bounded buffers

**Decision:** Long-lived observation tools return session IDs immediately and expose events through cursor-based reads.

**Decision:** Observation buffers and per-iteration reads are bounded, and overflow is reported explicitly.

**Decision:** Log following distinguishes append, truncate and file replacement/rotation rather than assuming one monotonically growing file.

**Why:** Observation must not hold MCP calls open, consume unbounded memory, or silently pretend that lost buffered history is complete.

---

## D-023 — Windows file watching uses .NET FileSystemWatcher, not Node fs.watch

**Decision:** Windows file-watcher sessions use a PowerShell child hosting .NET `System.IO.FileSystemWatcher`.

**Decision:** Native Node `fs.watch` is not the Windows baseline for this module.

**Why:** Two independent GitHub Windows CI runs reproduced libuv assertion crashes, including with non-recursive Node watcher handles. The .NET backend passed the same recursive/cursor/cleanup acceptance suite.

**Semantics:** File watcher events remain OS notifications that may be coalesced and are not presented as a lossless audit log.

---

## D-024 — Scheduled Task mutations use exact task path + name

**Decision:** Scheduled Task lifecycle/destructive operations require exact `task_path + task_name`.

**Decision:** Wildcard mutation is not supported.

**Decision:** Task creation uses the Windows user running LConnect without storing a password; default run level is Limited.

**Decision:** Native ScheduledTasks cmdlet objects are suppressed from stdout so MCP output remains one structured JSON contract.

**Why:** Task Scheduler is persistent system state. Exact identity and deterministic output reduce accidental cross-task mutation and parser ambiguity.

---

## D-025 — First-run tunnel configuration remains local-only even when documentation is explicit

**Decision:** The repository may document a sanitized placeholder profile shape and exact first-run steps, but it does not ship a real `mcp-conf.yaml` or a populated tunnel profile template.

**Decision:** Runtime API keys remain environment references (`env:CONTROL_PLANE_API_KEY`) and are entered at Start time rather than persisted by LConnect.

**Decision:** Release archives are built from tracked tag content so ignored local runtime/profile/secret files cannot be included accidentally.

**Why:** First-run documentation must be explicit enough to eliminate guessing without weakening the existing local-only tunnel identity and secret boundary.

---

## D-026 — Agent operations reliability before Desktop/Browser expansion

**Decision:** Complete the six-task Agent Operations Reliability phase (LCN-025–030) before starting LCN-018–023 Desktop/Browser implementation.

**Scope:** The phase is intentionally limited to managed session completion, incremental process output, structured text search, file integrity, exact Git ref/ancestry safety, and GitHub Actions/Release integration.

**Why:** Real long-running development/release use showed that LConnect already has sufficient execution power, but agents still need repeated raw-shell orchestration for waiting, evidence collection, integrity proof and release control. Strengthening these reusable primitives first provides greater reliability/value and reduces ambiguity before GUI/browser automation adds another large stateful layer.

**Non-goal:** This decision does not cancel LCN-018–023. It only changes execution priority. Event Log, archive, registry and other adjacent capabilities are not included in this six-task phase.

**Compatibility:** Existing 91 tools remain supported; raw PowerShell/command execution remains an escape hatch.

---
