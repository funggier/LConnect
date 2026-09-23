# ACTIVE — LConnect Development

Last updated: 2026-09-23

## Current state

- Repository: `funggier/LConnect`
- Working branch: `lcn-031-timeout-containment`
- Baseline main HEAD: `b187207c8ad3fea6e8c27c453bf038a9b0432932`
- Published release: `v1.1.0 — Expanded Tools & First-Run Guide`
- Published v1.1.0 catalog: 91 tools
- Current main MCP catalog: 96 tools
- LCN-025: COMPLETE
- LCN-026: COMPLETE
- LCN-031: ACTIVE — timeout containment priority
- LCN-027: READY but intentionally paused
- LCN-028–030: PLANNED
- LCN-018–023: PLANNED after reliability phase

## Active task

### LCN-031 — MCP Request Timeout Containment

Status: **ACTIVE**

Task: [tasks/LCN-031-mcp-request-timeout-containment.md](tasks/LCN-031-mcp-request-timeout-containment.md)

Focus only:

- bound synchronous MCP waits below a configurable request budget
- preserve managed-process execution across request/UI timeout
- make wait/result timeout evidence explicit
- add regression coverage

No LCN-027 implementation should be mixed into this task.

## Previous completed tasks

- [LCN-025 — Managed Session Completion](tasks/LCN-025-managed-session-completion.md)
- [LCN-026 — Incremental Process Output Cursor](tasks/LCN-026-process-output-cursor.md)
