# ACTIVE — LConnect Development

Last updated: 2026-09-19

## Current baseline

- Repository: `funggier/LConnect`
- Branch: `main`
- Current implementation HEAD: `df47b37ac497064ab47dde65d13911829d5f76ac`
- Latest released baseline: `v1.0.2 — Basic Recovery`
- Platform validated: Windows 10 x64 / Node.js 24 / Windows PowerShell 5.1
- OpenAI tunnel-client minimum: `0.0.14`
- MCP topology: one `main` channel, modular Core
- Current discovered tool catalog in tests: 63 tools

> Before modifying source, verify live GitHub/local HEAD.

## Active task

### LCN-013 — Development Module

Status: **ACTIVE**

Task: [tasks/LCN-013-development-module.md](tasks/LCN-013-development-module.md)

Purpose:

เพิ่ม project/build/test abstraction ที่ตรวจ project จาก evidence และเริ่มงานยาวผ่าน process session แทนการ block MCP call

Planned capabilities:

- `detect_project`
- `detect_build_system`
- `project_info`
- `install_dependencies`
- `run_build`
- `run_tests`
- `run_lint`

## Design direction

Execution tools should return the same process `session_id` contract already consumed by:

- `read_process_output`
- `write_process_input`
- `terminate_process`
- `list_sessions`

This avoids creating a second job registry.

## Recently completed

### LCN-012 — Git Module

- implementation: `b7ea5b99871385e031580de3ddec55d1ab1112d8`
- portability fix: `df47b37ac497064ab47dde65d13911829d5f76ac`
- passing CI: `35449417945`
- result: PASS
- catalog: 63 tools
