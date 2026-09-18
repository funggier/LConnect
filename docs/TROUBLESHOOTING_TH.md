# การแก้ปัญหา LConnect

## ChatGPT เห็นแต่ filesystem tools เดิม

อาการ:

- Core ใหม่รันแล้ว
- แต่ ChatGPT ยังไม่เห็น `powershell_run`, `system_info`, `start_process`

สาเหตุที่พบได้:

- connector/plugin ยัง cache tool schema เดิม

วิธีแก้:

1. ตรวจว่า LConnect runtime ใช้ `node "lconnect-mcp.mjs"`
2. ตรวจ readiness
3. refresh connector/plugin
4. ถ้ายังไม่เปลี่ยน ให้เปิด chat ใหม่แล้วตรวจ tool catalog

## ตรวจว่า Core ใหม่รันจริงหรือไม่

ดู:

```text
logs\tunnel-*.err.log
```

ควรเห็นข้อความ LConnect starting

และ:

```text
logs\tunnel-*.out.log
```

ควรเห็น tunnel-client start stdio MCP command สำเร็จ

## npm.cmd รันไม่ได้

LConnect มี Windows fallback สำหรับ `.cmd/.bat`

ถ้ายังมีปัญหา:

1. ตรวจ `node --version`
2. ตรวจ `npm --version`
3. รัน `npm run check`
4. รัน `npm test`

## list_listening_ports ล้ม

LConnect รุ่นปัจจุบันใช้ PowerShell-hosted `netstat.exe`

เหตุผลคือ runtime acceptance พบว่า `Get-NetTCPConnection` สามารถโยน `System.OutOfMemoryException` บนบาง Windows environment ได้

ถ้า tool ยังล้มหลังอัปเดต source ให้ restart LConnect เพื่อโหลด module ใหม่

## แก้ source แล้วแต่ behavior ไม่เปลี่ยน

Node ESM modules ถูกโหลดตอน Core start

ดังนั้น:

1. Stop LConnect
2. Start LConnect ใหม่
3. ถ้า tool schema เปลี่ยน ให้ refresh connector/plugin

## Start-LConnect บอกว่า mcp-conf.yaml หาย

เป็น behavior ที่ตั้งใจไว้

Tunnel configuration ไม่อยู่ใน GitHub

ให้สร้าง local tunnel profile ของคุณเองก่อน แล้วเก็บไว้ local เท่านั้น

ดู:

- https://github.com/openai/tunnel-client/blob/master/docs/connectors.md
- https://github.com/openai/tunnel-client/blob/master/docs/configuration.md

## Tunnel ไม่พร้อม

ใช้:

```text
Status-LConnect.cmd
```

และตรวจ:

```text
logs\doctor-latest.log
logs\tunnel-*.out.log
logs\tunnel-*.err.log
```

OpenAI tunnel-client มี `doctor --explain` สำหรับตรวจ dependency/configuration

## Tunnel มองไม่เห็นใน ChatGPT

ตรวจ:

- tunnel ถูกสร้างและ scope ถูกต้อง
- runtime key มี permission ใช้ tunnel
- daemon กำลังรันและ readiness ผ่าน
- ChatGPT Connector ใช้ Connection: Tunnel
- refresh connector หลัง runtime พร้อมแล้ว

## Full-machine access แต่บาง path ยังเข้าไม่ได้

Full-machine access ไม่ได้ bypass Windows ACL/UAC

LConnect เข้าถึงได้เท่าที่ Windows account ที่รัน process มีสิทธิ์

ถ้าต้องใช้สิทธิ์ Administrator ต้องเปิด runtime ภายใต้ account/elevation ที่เหมาะสม

## Process session หาย

process sessions อยู่ใน memory ของ LConnect Core

เมื่อ restart Core:

- session registry ถูก reset
- process บางตัวอาจยังอยู่ถ้าไม่ได้ terminate ก่อน restart

ใช้ `list_processes` ตรวจ process จริงของ Windows เมื่อจำเป็น
