# ACTIVE — LConnect Development

Last updated: 2026-09-19

## Current baseline

- Repository: `funggier/LConnect`
- Branch: `main`
- Current implementation HEAD: `34c1e50100e0535d684f8b1ae7bd2e42b93d2718`
- Current tested catalog: 83 tools
- Runtime source: `T:\Sanbox\openclawspace\tunnel-mcp-ok`
- Stop boundary: complete LCN-017 and stop before LCN-018

## Active task

### LCN-017 — Scheduled Tasks

Status: **READY**

Task: [tasks/LCN-017-scheduled-tasks.md](tasks/LCN-017-scheduled-tasks.md)

Planned capabilities:

- `list_scheduled_tasks`
- `get_scheduled_task`
- `create_scheduled_task`
- `run_scheduled_task`
- `stop_scheduled_task`
- `enable_scheduled_task`
- `disable_scheduled_task`
- `delete_scheduled_task`

## Stop boundary

After LCN-017 reaches COMPLETE with tests/CI/report/coordination state updated, stop. Do not begin LCN-018.
