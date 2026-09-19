# ACTIVE — LConnect Development

Last updated: 2026-09-19

## Current baseline

- Repository: `funggier/LConnect`
- Branch: `main`
- Current implementation HEAD: `bddad237d913db60a6afd8703654181b6bef0a43`
- Latest released baseline: `v1.0.2 — Basic Recovery`
- Platform validated: Windows 10 x64 / Node.js 24 / Windows PowerShell 5.1
- OpenAI tunnel-client minimum: `0.0.14`
- MCP topology: one `main` channel, modular Core
- Current discovered tool catalog in tests: 41 tools

> Before modifying source, verify live GitHub/local HEAD.

## Active task

### LCN-010 — Port / Network

Status: **READY**

Task: [tasks/LCN-010-port-network.md](tasks/LCN-010-port-network.md)

Purpose:

เพิ่ม structured network diagnostics สำหรับ TCP/UDP, port ownership, connectivity, DNS, interfaces และ ping โดยหลีกเลี่ยง path ที่เคยทำให้ `Get-NetTCPConnection` ใช้ memory สูงผิดปกติบนเครื่องจริง

Planned capabilities:

- `tcp_connections`
- `udp_endpoints`
- `port_owner`
- `port_test`
- `dns_lookup`
- `network_interfaces`
- `ping_host`

## Why this task is next

Network evidence เป็น dependency สำคัญของ tunnels, local servers, Ollama, browser automation, dashboards และ future HTTP/Development modules

## Immediate next steps

1. Establish RED catalog tests.
2. Prefer native lightweight sources over `Get-NetTCPConnection`.
3. Define structured TCP/UDP parsing and PID correlation.
4. Add connectivity/DNS/interface tools.
5. Use disposable local TCP server fixtures for acceptance.
6. Update docs/tests.
7. Push and use GitHub CI as acceptance gate.

## Recently completed

### LCN-009 — Windows Services

- implementation commit: `bddad237d913db60a6afd8703654181b6bef0a43`
- CI run: `35448002152`
- result: PASS
- catalog: 41 tools
