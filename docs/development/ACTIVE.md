# ACTIVE — LConnect Development

Last updated: 2026-09-19

## Current baseline

- Repository: `funggier/LConnect`
- Branch: `main`
- Current implementation HEAD: `54708082b1e3f91abf32a26900d4c263e1837314`
- Latest released baseline: `v1.0.2 — Basic Recovery`
- Platform validated: Windows 10 x64 / Node.js 24 / Windows PowerShell 5.1
- OpenAI tunnel-client minimum: `0.0.14`
- MCP topology: one `main` channel, modular Core
- Current discovered tool catalog in tests: 48 tools

> Before modifying source, verify live GitHub/local HEAD.

## Active task

### LCN-011 — Hardware

Status: **ACTIVE**

Task: [tasks/LCN-011-hardware.md](tasks/LCN-011-hardware.md)

Purpose:

เพิ่ม structured hardware/resource evidence สำหรับ CPU, memory, disks, GPU, storage health และ battery โดยต้อง report unsupported/unavailable อย่างตรงไปตรงมา ไม่เดาค่า

Planned capabilities:

- `cpu_info`
- `memory_info`
- `disk_info`
- `gpu_info`
- `storage_health`
- `battery_info`

## Immediate next steps

1. Establish RED catalog tests.
2. Prefer Node/WMI/CIM sources with bounded output.
3. Keep unavailable/vendor-specific telemetry explicit.
4. Validate on the operator's Windows 10 machine and GitHub Windows runner.
5. Update docs/tests.
6. Push and use GitHub CI as acceptance gate.

## Recently completed

### LCN-010 — Port / Network

- implementation commit: `54708082b1e3f91abf32a26900d4c263e1837314`
- CI run: `35448325044`
- result: PASS
- catalog: 48 tools
