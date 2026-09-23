# ACTIVE — LConnect Development

Last updated: 2026-09-23

## Current state

- Repository: `funggier/LConnect`
- Branch: `main` after merge of the validated LCN-031 candidate
- Published release: `v1.1.0 — Expanded Tools & First-Run Guide`
- Published v1.1.0 catalog: 91 tools
- Current source MCP catalog: 96 tools
- LCN-025: COMPLETE
- LCN-026: COMPLETE
- LCN-031: COMPLETE — MCP request timeout containment
- LCN-027: READY
- LCN-028–030: PLANNED
- LCN-018–023: PLANNED after reliability phase

## Active task

**NO ACTIVE DEVELOPMENT TASK**

## Latest completed task

### LCN-031 — MCP Request Timeout Containment

Status: **COMPLETE**

Task: [tasks/LCN-031-mcp-request-timeout-containment.md](tasks/LCN-031-mcp-request-timeout-containment.md)

Report: [reports/LCN-20260923-031-mcp-request-timeout-containment.md](reports/LCN-20260923-031-mcp-request-timeout-containment.md)

Validated:

- configurable synchronous request containment budget
- short bounded `wait_session` with explicit return evidence
- managed processes outlive short wait/request timeouts
- child-process timeout no longer waits indefinitely for inherited stdio `close`
- HTTP deadline covers response body/download
- single `main` MCP channel unchanged
- Windows CI GREEN

## Next planned task

### LCN-027 — Structured Text Search

Status: **READY**

LCN-027 remains ready but was intentionally not started during timeout work.
