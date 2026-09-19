# LCN-010 — Port / Network

Status: **READY**

## Goal

วิเคราะห์ tunnels, local servers, dashboards และ IPC

## Planned capabilities

tcp_connections, udp_endpoints, port_owner, port_test, dns_lookup, network_interfaces, ping_host

## Design notes

structured network evidence; bounded output; avoid heavy Get-NetTCPConnection path

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