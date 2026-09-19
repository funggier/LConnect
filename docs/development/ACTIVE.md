# ACTIVE — LConnect Development

Last updated: 2026-09-19

## Current baseline

- Repository: `funggier/LConnect`
- Branch: `main`
- Current implementation HEAD: `faf32054ecf916b85f3d8583659fbc2f5128e8dc`
- Latest released baseline: `v1.0.2 — Basic Recovery`
- Platform validated: Windows 10 x64 / Node.js 24 / Windows PowerShell 5.1
- OpenAI tunnel-client minimum: `0.0.14`
- MCP topology: one `main` channel, modular Core
- Current discovered tool catalog in tests: 30 tools

> Before modifying source, verify live GitHub/local HEAD. Do not assume the SHA above is still current.

## Active task

### LCN-008 — Process Advanced

Status: **READY**

Task: [tasks/LCN-008-process-advanced.md](tasks/LCN-008-process-advanced.md)

Purpose:

ยกระดับ process support จาก basic list/kill/session tools ไปเป็น structured inspection และ lifecycle control ที่ใช้เป็นฐานให้ Services, Development jobs และ Desktop/Browser process coordination

Planned capabilities:

- `process_details`
- `process_tree`
- `find_process`
- `wait_process`
- `restart_process`

## Why this task is next

Process Advanced เป็น dependency ที่มีประโยชน์ต่อ:

- Windows Services
- Development builds/tests
- browser lifecycle
- local server diagnostics
- PID ownership correlation
- future job/session abstraction

## Immediate next steps

1. Verify current `main` and CI status.
2. Define stable process identity fields and PID-reuse safeguards.
3. Establish RED tests for the five tools.
4. Implement structured process inspection first.
5. Implement wait/restart semantics without holding one RPC indefinitely.
6. Update docs/tests.
7. Run local validation.
8. Push and use GitHub CI as acceptance gate.
9. Close LCN-008 with evidence and advance ACTIVE.

## Recently completed

LCN-007 — Environment Module

- implementation commit: `faf32054ecf916b85f3d8583659fbc2f5128e8dc`
- CI run: `35447312363`
- result: PASS
- catalog: 30 tools
