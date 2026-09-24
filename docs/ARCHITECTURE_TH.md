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
   +-- modules/process-advanced.mjs
   +-- modules/services.mjs
   +-- modules/network.mjs
   +-- modules/hardware.mjs
   +-- modules/git.mjs
   +-- modules/development.mjs
   +-- modules/http.mjs
   +-- modules/log-tail.mjs
   +-- modules/file-watcher.mjs
   +-- modules/scheduled-tasks.mjs
   +-- modules/transient-state.mjs
   +-- modules/system.mjs
   +-- modules/environment.mjs
   +-- modules/telemetry.mjs
   +-- modules/batch-inspect.mjs
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

process module เก็บ transient session ใน memory และยังคงเป็น direct Plugin operation handle ไม่ใช่ workflow/job engine

เหมาะกับ CLI/server ที่ต้อง:

- ทำงานนานเกินหนึ่ง MCP request
- รอแบบ bounded ด้วย `wait_session`
- อ่าน output หลายรอบ
- อ่าน incremental events ด้วย sequence cursor
- รับ stdin
- terminate ภายหลัง
- release/prune terminal handles เมื่อไม่ใช้แล้ว

Process lifecycle ใช้ `exit` เป็น terminal state ส่วน stdout/stderr drain แยกด้วย `streams_closed` เพราะ descendant process อาจถือ pipe ต่อหลัง parent exit

`read_process_output` ยังคงอยู่เพื่อ compatibility ขณะที่ `read_process_events` ให้ cursor semantics แบบ monotonic/bounded/overflow-visible

### Transient state refresh

`modules/transient-state.mjs` รวม inventory/reconcile ของ:

- managed process sessions
- log followers
- file watchers

`refresh_state` เป็น soft online housekeeping เท่านั้น:

- ไม่ restart LConnect
- ไม่ kill running process
- ไม่ stop active observer
- ไม่แก้ Scheduled Tasks/Services/files/Git

สำหรับการล้าง generated disk state หลังหยุด LConnect ใช้ `Refresh-LConnect.cmd` ซึ่งเป็น offline reset คนละระดับกับ MCP `refresh_state`

## Process Advanced

process-advanced module ทำ structured OS process inspection/lifecycle control แยกจาก in-memory process sessions

หลักการสำคัญ:

- PID อย่างเดียวไม่ใช่ identity ที่ปลอดภัย
- destructive/wait operations ใช้ `PID + creation_time`
- `wait_process` จำกัดเวลาต่อ call และเรียกซ้ำได้
- `restart_process` ต้องได้รับ relaunch command แบบ explicit
- module ไม่ parse/เดา original Windows command line เพื่อ restart

แนวทางนี้ลดความเสี่ยงจาก PID reuse และสอดคล้องกับ long-running/session design ของ LConnect

## Windows Services

services module เป็น structured wrapper เหนือ Windows Service Control Manager และ service APIs

หลักการ:

- read/mutation ใช้ exact service `Name`
- ไม่ใช้ wildcard/display name สำหรับ lifecycle mutation
- start/stop/restart มี bounded wait
- startup mode รองรับ automatic/delayed/manual/disabled
- permission/SCM failures ไม่ถูกซ่อน
- local tests เป็น read-only; mutation acceptance ใช้ disposable service บน CI

## Network

network module ใช้หลาย primitive ตามความเหมาะสม:

- TCP/UDP endpoint enumeration: `netstat.exe` + structured parser
- TCP connectivity: Node `net.Socket`
- DNS: Node OS resolver
- interfaces: Node `os.networkInterfaces()`
- ICMP: .NET Ping

ตั้งใจไม่ใช้ `Get-NetTCPConnection` เป็น enumeration baseline เพราะเคยพบ memory pressure/OOM บน runtime จริง

Acceptance ใช้ local TCP/UDP fixtures และ loopback เท่านั้น จึงไม่ต้องพึ่ง external internet

## Hardware

hardware module เป็น read-only diagnostics layer ใช้ Node OS APIs และ Windows CIM/Storage APIs ตามความเหมาะสม

หลักการสำคัญ:

- observed telemetry กับ unavailable telemetry ต้องแยกชัด
- ไม่ fabricate sensor/SMART/battery data
- storage health ระบุ source ว่าเป็น `Get-PhysicalDisk` หรือ fallback
- ไม่มี hardware mutation/control ใน module นี้
- desktop ที่ไม่มี battery เป็น valid `available=false` state

## Git

git module เป็น structured wrapper เหนือ Git CLI โดยใช้ direct argv execution ไม่ผ่าน shell

หลักการ:

- ทุก operation มี explicit `repo_path`
- read operations ใช้ stable porcelain/ref formats
- mutations คืน exact SHA/ref evidence
- `git_pull` เป็น fast-forward-only โดย default
- force push ไม่อยู่ใน first contract
- commit staging ต้อง explicit
- acceptance ใช้ disposable repositories/local bare remote เท่านั้น

## Development

development module ทำ project/build/test abstraction โดยไม่สร้าง job registry ซ้ำ

`modules/process.mjs` export shared managed-process session helpers เพื่อให้:

- `start_process`
- `install_dependencies`
- `run_build`
- `run_tests`
- `run_lint`

ใช้ session registry เดียวกัน

ดังนั้นงานยาวคืน `session_id` แล้วใช้ `read_process_output` / `terminate_process` เดิมได้

Node/npm เป็น executable baseline แรก ส่วน ecosystem ที่ detect ได้แต่ยังไม่มี execution contract จะรายงาน unsupported ชัดเจน

## HTTP

HTTP module ใช้ Node Fetch API และกำหนด timeout/redirect/body bounds อย่าง explicit

response ที่ใหญ่ไม่ถูกอ่านแบบ unbounded

downloads ใช้ temporary file + rename และเคารพ filesystem access policy เดียวกับ LConnect

acceptance ใช้ local HTTP fixture เพื่อไม่พึ่ง external internet

## Log Tail

log-tail module ใช้ background bounded polling พร้อม sequence cursor

ไม่มี MCP call ใดถูก hold ไว้เพื่อรอ log ใหม่

Follower แยก append, truncate และ file replacement/rotation และเก็บ event buffer แบบ bounded พร้อม overflow evidence

## File Watcher

file-watcher module wrap `fs.watch` ด้วย bounded in-memory session/cursor contract

event source อาจ coalesce events ตาม semantics ของ OS/Node จึงรายงานเป็น notification stream ไม่ใช่ lossless filesystem audit

## Scheduled Tasks

scheduled-tasks module เป็น structured wrapper เหนือ Windows Task Scheduler / ScheduledTasks cmdlets

หลักการ:

- lifecycle/destructive identity ใช้ exact `task_path + task_name`
- no wildcard mutation
- create action/trigger/principal แบบ structured
- current Windows user principal โดยไม่เก็บ password
- default run level = Limited
- task folder สามารถสร้างผ่าน Task Scheduler COM
- mutation acceptance ใช้ disposable CI tasks

Scheduled Tasks เป็น persistence layer ที่อยู่ข้าม LConnect process/restart ได้ จึงแยกจาก in-memory process/watch sessions อย่างชัดเจน

## System

system module ใช้ Node + PowerShell + Windows executables สำหรับ host diagnostics/process/network

## Environment

environment module ให้ structured contract สำหรับ:

- process/user/machine environment variables
- PATH inspection
- Windows PATHEXT executable resolution

process scope ใช้ Node environment โดยตรง ส่วน persistent user/machine scope ใช้ Windows environment API ผ่าน PowerShell โดยยังเคารพ execution setting ของ LConnect

## Batch Inspection

`modules/batch-inspect.mjs` เป็น round-trip-reduction layer แบบ bounded/deterministic สำหรับ read-only inspection เท่านั้น

หลักการ:

- caller ระบุ ordered operations ทั้งหมด upfront
- local execution เป็น sequential
- ใช้ allowlist ของ read-only tools
- reuse registered tool validation/handlers เดิม
- จำกัดจำนวน operations
- จำกัดผลลัพธ์ต่อ operation และรวมทั้ง batch
- ไม่มี conditional branch
- ไม่มี loop
- ไม่มี autonomous continuation
- ไม่มี persistent workflow state

จึงลด:

```text
N MCP round trips
        ↓
1 MCP round trip + N local handler calls
```

โดยยังคง ChatGPT เป็น intelligence/workflow owner

LCN-033 telemetry สามารถเห็น outer `batch_inspect` และ internal handlers ภายใต้ MCP request ID เดียวกัน เพื่อวัด local work เทียบกับ caller wall time

## Tool Telemetry

`modules/telemetry.mjs` instrument การ register tools ที่ MCP server boundary หนึ่งจุด แทนการแก้ทุก handler แยกกัน

หลักการ:

- จับเฉพาะ metadata ที่จำเป็นต่อ latency correlation
- ใช้ bounded in-memory ring buffer
- ไม่ persist โดย default
- ไม่บันทึก arguments หรือ payload contents
- ไม่เปลี่ยน tool semantics
- ไม่เพิ่ม MCP channel
- diagnostic tool `tool_telemetry` ไม่ instrument ตัวเองเพื่อไม่ให้ snapshot รบกวนข้อมูลที่กำลังอ่าน

จุดนี้ใช้แยก:

```text
LConnect handler elapsed
        vs
caller-observed Tool wall time
```

เพื่อวิเคราะห์ Message delivery timeout โดยไม่เดาว่า latency อยู่ใน local handler เสมอ

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
