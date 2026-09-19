# ACTIVE — LConnect Development

Last updated: 2026-09-19

## Current baseline

- Repository: `funggier/LConnect`
- Branch: `main`
- Current implementation HEAD: `092f3d8ae2dd4fce9bb38cc366431cc49d400569`
- Latest released baseline: `v1.0.2 — Basic Recovery`
- Platform validated: Windows 10 x64 / Node.js 24 / Windows PowerShell 5.1
- OpenAI tunnel-client minimum: `0.0.14`
- MCP topology: one `main` channel, modular Core
- Current discovered tool catalog in tests: 35 tools

> Before modifying source, verify live GitHub/local HEAD. Do not assume the SHA above is still current.

## Active task

### LCN-009 — Windows Services

Status: **READY**

Task: [tasks/LCN-009-windows-services.md](tasks/LCN-009-windows-services.md)

Purpose:

เพิ่ม structured Windows Service Control ให้ LConnect เพื่อให้ตรวจ state/startup mode/PID และควบคุม service lifecycle ได้โดยไม่ต้องเขียน raw PowerShell ทุกครั้ง

Planned capabilities:

- `list_services`
- `get_service`
- `start_service`
- `stop_service`
- `restart_service`
- `set_service_startup`

## Why this task is next

Windows Services เป็นฐานสำคัญสำหรับ persistent runtimes เช่น local AI servers, agents, development services และ future scheduled/persistent infrastructure

## Immediate next steps

1. Verify current `main` and CI state.
2. Define service identity/state schema.
3. Establish RED catalog tests.
4. Implement read-only service inspection first.
5. Implement lifecycle mutations with exact service-name targeting.
6. Add safe disposable service acceptance strategy where CI permissions allow; otherwise use read-only CI + bounded local fixture strategy.
7. Update docs/tests.
8. Push and use GitHub CI as acceptance gate.
9. Close LCN-009 with evidence.

## Recently completed

### LCN-008 — Process Advanced

- implementation commit: `092f3d8ae2dd4fce9bb38cc366431cc49d400569`
- CI run: `35447697883`
- result: PASS
- catalog: 35 tools
