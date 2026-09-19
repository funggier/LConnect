# สถาปัตยกรรม LConnect

## เป้าหมาย

LConnect เป็น local-machine capability hub สำหรับ ChatGPT

หลักการคือ:

> Tunnel-facing contract ควรคงที่ แต่ความสามารถภายในเพิ่มเป็น modules ได้เรื่อย ๆ

## Topology

```text
ChatGPT
   |
   v
OpenAI Tunnel
   |
   v
main MCP channel
   |
   v
lconnect-mcp.mjs
   |
   +-- modules/config.mjs
   +-- modules/runtime.mjs
   +-- modules/filesystem.mjs
   +-- modules/shell.mjs
   +-- modules/process.mjs
   +-- modules/system.mjs
   +-- modules/environment.mjs
```

## เหตุผลที่ใช้ main channel เดียว

ChatGPT tool discovery ทำงานกับ MCP catalog ที่อยู่หลัง endpoint/channel ที่เชื่อมอยู่

การรวม filesystem, shell, process และ system ไว้ใน MCP server เดียวทำให้:

- `tools/list` เห็นเครื่องมือทั้งหมด
- ไม่ต้องพึ่งการ merge tool catalogs จากหลาย channel
- เพิ่ม module ใหม่โดยไม่เปลี่ยน tunnel config
- debug ง่ายกว่า
- plugin refresh เพียงครั้งเดียวเห็น catalog ใหม่

## Core

`lconnect-mcp.mjs` มีหน้าที่:

1. โหลด config
2. สร้าง MCP server
3. register modules
4. connect ผ่าน stdio transport

Core ไม่ควรมี implementation รายละเอียดของแต่ละ capability มากเกินไป

## Module contract

รูปแบบพื้นฐาน:

```js
export function registerSomethingTools(server, config) {
  server.tool(...);
}
```

เพิ่ม module ใหม่แล้ว import/register ใน Core

## Config

`modules/config.mjs` โหลด:

```text
lconnect-config.json
```

ค่า default:

- full-machine filesystem access
- shell enabled
- bounded output buffer
- bounded timeout
- bounded process-session buffer

Tunnel configuration ไม่อยู่ใน config นี้

## Runtime

`modules/runtime.mjs` เป็น abstraction กลางสำหรับ:

- spawn child process
- collect stdout/stderr
- timeout
- PowerShell invocation
- output truncation

## Filesystem

filesystem module ใช้ Node `fs` โดยตรง

เมื่อ `fullMachineAccess=true` path guard จะยอมรับทุก absolute/resolved path ที่ Windows account มีสิทธิ์จริง

เมื่อปิด full-machine access จึงค่อยใช้ `allowedDirectories`

## Shell

shell module เปิด:

- PowerShell
- arbitrary executable

สิทธิ์ process เท่ากับ Windows account ที่รัน LConnect

## Process/session

process module เก็บ session ใน memory

เหมาะกับ CLI/server ที่ต้อง:

- ทำงานนาน
- อ่าน output หลายรอบ
- รับ stdin
- terminate ภายหลัง

## System

system module ใช้ Node + PowerShell + Windows executables สำหรับ host diagnostics/process/network

## Environment

environment module ให้ structured contract สำหรับ:

- process/user/machine environment variables
- PATH inspection
- Windows PATHEXT executable resolution

process scope ใช้ Node environment โดยตรง ส่วน persistent user/machine scope ใช้ Windows environment API ผ่าน PowerShell โดยยังเคารพ execution setting ของ LConnect

## การเพิ่ม module ในอนาคต

ตัวอย่าง:

```text
modules/screen.mjs
modules/input.mjs
modules/windows.mjs
modules/services.mjs
modules/registry.mjs
modules/network.mjs
modules/git.mjs
modules/docker.mjs
modules/hardware.mjs
modules/cogentnexus.mjs
modules/zooid.mjs
```

โดยทั่วไปไม่ควรเพิ่ม tunnel channel ใหม่เพียงเพราะเพิ่ม capability

ควรเพิ่ม module เข้า LConnect Core เดิม เว้นแต่มีเหตุผลด้าน transport/routing ที่จำเป็นจริง ๆ
