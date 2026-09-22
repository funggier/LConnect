# ACTIVE — LConnect Development

Last updated: 2026-09-22

## Current baseline

- Repository: `funggier/LConnect`
- Branch: `main`
- Starting HEAD for this implementation: `807460fab8a8514101b01fe8cfdeec0c6e663dcd`
- Published release: `v1.1.0 — Expanded Tools & First-Run Guide`
- Published v1.1.0 catalog: 91 tools
- Current local candidate catalog: 96 tools
- LCN-007–017: COMPLETE
- LCN-024: COMPLETE
- LCN-025: ACTIVE
- LCN-026: ACTIVE
- LCN-027–030: PLANNED
- LCN-018–023: PLANNED after reliability phase

## Active tasks

### LCN-025 — Managed Session Completion

Status: **ACTIVE**

Task: [tasks/LCN-025-managed-session-completion.md](tasks/LCN-025-managed-session-completion.md)

Primary additions:

- `wait_session`
- `release_session`
- `prune_sessions`
- `refresh_state`
- optional `start_process.label`
- `Refresh-LConnect.cmd` / `Refresh-LConnect.ps1`

### LCN-026 — Incremental Process Output Cursor

Status: **ACTIVE**

Task: [tasks/LCN-026-process-output-cursor.md](tasks/LCN-026-process-output-cursor.md)

Primary addition:

- `read_process_events`

## Current acceptance state

Targeted tests are GREEN.

Important lifecycle finding:

- process `exit` is terminal lifecycle evidence
- stdio `close` may occur later when descendants retain inherited handles
- `streams_closed` is therefore explicit and separate

Full repository validation and GitHub CI are still required before both tasks can close.

## Next planned task after this pair

LCN-027 — Structured Text Search remains **PLANNED** until LCN-025/026 are closed.
