# LCN-010 — Port / Network

Status: **ACTIVE**

## Goal

วิเคราะห์ tunnels, local servers, dashboards และ IPC

## Planned capabilities

tcp_connections, udp_endpoints, port_owner, port_test, dns_lookup, network_interfaces, ping_host

## Design notes

structured network evidence; bounded output; avoid heavy Get-NetTCPConnection path

## Progress

- 2026-09-19: Started from coordination HEAD `0db4a91cc41bf8ae541da57e2ac39e4fee35e1de`.
- RED established: smoke catalog expected seven network tools and failed because implementation was absent.
- Existing production evidence showed `Get-NetTCPConnection` could trigger excessive memory use on the operator machine; implementation does not use it.
- Added `modules/network.mjs`.
- Added `tests/network-smoke.mjs`.
- TCP/UDP endpoint enumeration uses lightweight `netstat.exe -ano` parsing.
- `port_test` uses Node socket; DNS/interfaces use Node APIs; ping uses bounded .NET Ping.
- Local fixture acceptance PASS: TCP listener enumeration, owner PID correlation, TCP connect, UDP socket enumeration, localhost DNS, interfaces, loopback ping.
- Local catalog: 48 tools.
- `npm run check`: PASS.
- `npm test`: PASS.
- `npm audit --audit-level=moderate`: 0 vulnerabilities.

## Acceptance criteria

- capability ถูก register ผ่าน MCP และมี structured schema
- output bounded และ error preserve root cause
- tests ครอบคลุม happy path + failure path ที่สำคัญ
- existing tools ไม่ regression
- documentation อัปเดต
- npm check/test/audit และ GitHub CI PASS
- บันทึก exact commit SHA, changed files, runtime evidence และ follow-up tasks ตอนปิดงาน

## Scope rule

ถ้าพบ adjacent work ที่แยกได้ ให้สร้าง numbered task ใหม่แทนการขยาย task นี้ไม่สิ้นสุด