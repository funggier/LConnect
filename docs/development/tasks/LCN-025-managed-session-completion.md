# LCN-025 — Managed Session Completion

Status: **COMPLETE**

## Goal

เพิ่ม managed-session completion + hygiene primitives เพื่อให้ agent:

- รอ process session แบบ bounded ได้โดยไม่ต้องประกอบ sleep/poll loop ซ้ำเอง
- แยก running/completed session ได้ชัด
- ปล่อย completed session ที่ไม่ใช้แล้วออกจาก LConnect memory
- เริ่ม ChatGPT/AI session ใหม่โดยตรวจและ cleanup state เก่าได้อย่าง explicit โดยไม่ฆ่างานที่ยังรันอยู่โดยไม่ตั้งใจ

## Why

`start_process` แก้ปัญหา long-running operation ได้ดีแล้ว แต่ terminal completion ยังต้อง poll ด้วยหลาย MCP calls

งานจริงที่กินเวลาหลายนาทีแสดงว่ารูปแบบนี้เพิ่ม orchestration overhead และเพิ่มโอกาส upstream UI/tool timeout โดยไม่เพิ่มความถูกต้องของ local process

## Planned capability

Primary tools:

- `wait_session`
- `release_session`
- `prune_sessions`
- `refresh_state`

Existing:

- `list_sessions`
- `terminate_process`

ควรถูกใช้ร่วมกันเป็น lifecycle contract เดียว

## Required behavior

- bounded wait per call
- timeout does not terminate child
- repeated waits allowed
- terminal result idempotent
- exact exit code/signal preserved
- optional bounded stdout/stderr tail
- unknown/expired session diagnostic clear
- compatible with stdin and current session registry
- `read_process_output` remains supported
- session snapshot adds `completed_at` when terminal
- optional human/agent supplied `label` may be added to `start_process` for easier handoff identification
- `release_session` only forgets a terminal session; it must refuse a running session
- killing a running process remains the separate explicit `terminate_process` action
- `prune_sessions` defaults to terminal sessions only
- prune criteria must be explicit and bounded, such as older-than age
- no implicit cleanup of running sessions

## Suggested schema

Inputs:

- `session_id`
- `timeout_seconds`
- `poll_interval_ms`
- `include_output_tail`
- `output_tail_chars`

Outputs for `wait_session`:

- running/completed/timed_out
- exit_code/signal
- elapsed time
- bounded stdout/stderr tail

Suggested `release_session`:

Inputs:

- `session_id`

Semantics:

- terminal session -> remove session metadata/output buffers from LConnect memory
- running session -> refuse with clear diagnostic; caller must explicitly terminate first if that is intended

Suggested `prune_sessions`:

Inputs:

- `state` default `terminal`
- `older_than_seconds`
- `dry_run` default `true`

Output:

- matched session IDs
- released session IDs
- skipped running session IDs

Suggested `refresh_state`:

Purpose:

- reconcile LConnect transient registries with current local reality
- provide one clean entry-point when a new AI/chat session starts using an already-running LConnect instance
- optionally clean only safe stale/terminal handles

Default semantics:

- refresh process-session snapshots
- detect sessions that reached terminal state
- inventory active log followers
- inventory active file watchers
- report stopped/dead/error observer handles
- never terminate a running process
- never stop a running follower/watcher unless explicitly requested by a separate lifecycle command
- never modify Windows Scheduled Tasks, Services, files, Git state, or other persistent OS state
- optional safe pruning applies only to terminal/stopped transient handles

Suggested input:

```json
{
  "scope": "all",
  "prune_terminal": true,
  "older_than_seconds": 3600,
  "dry_run": false
}
```

Suggested result:

```json
{
  "process_sessions": {
    "running": [],
    "terminal": [],
    "released": []
  },
  "log_followers": {
    "active": [],
    "stopped_or_error": []
  },
  "file_watchers": {
    "active": [],
    "stopped_or_error": []
  },
  "persistent_os_state_modified": false
}
```

`refresh_state` is reconciliation/housekeeping only. It is not an LConnect restart command and does not refresh the ChatGPT connector itself.

## Tests

- exit 0
- exit nonzero
- timeout while process remains alive
- subsequent wait observes completion
- repeated terminal query
- stdin process compatibility
- terminal session release
- release-running refusal
- prune dry-run
- prune terminal sessions by age
- running sessions never silently pruned
- refresh state after a process completed while caller was away
- refresh inventory with active process/log/watch handles preserved
- refresh safe-prune path removes only eligible terminal/stopped transient handles
- refresh never mutates Scheduled Tasks/Services/persistent filesystem state
- session cleanup/unknown session behavior

## Implementation progress

- Started from main HEAD `807460fab8a8514101b01fe8cfdeec0c6e663dcd`.
- Added managed process metadata: `label`, `completed_at`, `streams_closed`, `closed_at`, elapsed time and process event cursor metadata.
- Added `wait_session` with bounded wait (max 30 seconds per call), repeatable terminal observation and optional bounded stdout/stderr tails.
- Added `release_session`; running sessions are refused and must be terminated explicitly if that is intended.
- Added `prune_sessions` with dry-run default and terminal-only cleanup.
- Added `refresh_state` through a shared transient-state module. It inventories process sessions, log followers and file watchers, optionally pruning only safe terminal/stopped handles.
- Added optional `label` to `start_process` for AI/session handoff identification.
- Added offline `Refresh-LConnect.ps1` + `Refresh-LConnect.cmd`:
  - refuses while recorded LConnect tunnel-client is running
  - clears `runtime/*`
  - clears `logs/*` by default
  - supports `-KeepLogs`
  - preserves local config, tunnel-client, dependencies, source, Scheduled Tasks, Services, Git and user files
- TDD caught a Windows PowerShell collision with built-in read-only `$PID`; refresh script now uses a non-reserved variable.
- Full-suite investigation found an important lifecycle distinction: a parent process can exit while descendants retain inherited stdio handles. Managed session terminal state now follows child `exit`; `close` is a fallback/output-drain signal.
- Targeted LCN-025 tests: PASS.
- PowerShell syntax: PASS.
- `npm run check`: PASS.
- Full local `npm test`: PASS / catalog = 96 tools.
- `npm audit --audit-level=moderate`: 0 vulnerabilities.

## Completion evidence

- Implementation commit: `9fcf3ea170dfed04d5233376505102a6501d606b`
- GitHub Actions run: `35754500025` — PASS
- Windows CI catalog: 96 tools
- `wait_session`: PASS
- exit-vs-pipe-close lifecycle: PASS
- `release_session` running guard/terminal release: PASS
- `prune_sessions` dry-run/terminal cleanup: PASS
- `refresh_state` active-state preservation + safe terminal prune: PASS
- `Refresh-LConnect.cmd/.ps1` running guard/runtime+log cleanup/preservation/`-KeepLogs`: PASS
- dependency audit: 0 vulnerabilities

## Acceptance criteria

- implementation reuses managed session registry
- no duplicate process lifecycle model
- npm check/test/audit PASS
- existing process/development tools do not regress
- direct MCP runtime acceptance PASS
- GitHub CI PASS
- docs/status/report updated

## AI session-switch hygiene

Recommended protocol when a new ChatGPT/AI session starts using an already-running LConnect instance:

1. call `list_sessions`
2. identify any `running=true` operations by command/cwd/start time/label
3. never auto-kill an unknown running operation
4. inspect or explicitly terminate it only when the AI/user decides it is stale
5. release/prune terminal sessions after evidence is no longer needed
6. then start new work

This keeps LConnect stateless at the workflow level while preventing stale in-memory handles from accumulating or confusing a new caller.

## User offline refresh

Add:

- `Refresh-LConnect.cmd`
- `Refresh-LConnect.ps1`

This is intentionally different from MCP `refresh_state`.

Required semantics:

1. user stops LConnect first
2. Refresh refuses if the recorded LConnect tunnel process is still running
3. clear generated transient disk state:
   - `runtime/*`
   - `logs/*`
4. recreate empty `runtime/` and `logs/`
5. preserve:
   - `mcp-conf.yaml`
   - `lconnect-config.json`
   - `tunnel-client.exe`
   - `node_modules/`
   - source/docs
6. do not modify Windows Scheduled Tasks, Services, Git state or user files
7. support `-KeepLogs` on the PowerShell script / passthrough CMD arguments for evidence-preserving refresh

Rationale:

Once LConnect is stopped, in-memory process/log/watch registries no longer exist. Offline refresh therefore cleans persisted launcher/health/log artifacts so the next Start begins from clean generated state without deleting user configuration.

## Scope rule

Do not add process output cursor semantics here except minimum internal work needed for `wait_session`; cursor work belongs to LCN-026.

Do not add persistent workflow state, autonomous continuation, or cross-restart task memory.
