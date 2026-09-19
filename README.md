# LConnect

**LConnect** คือ MCP server แบบ modular สำหรับให้ ChatGPT เข้าถึงและควบคุมเครื่อง Windows ผ่าน OpenAI Tunnel

เป้าหมายหลักของโปรเจกต์คือให้ AI สามารถทำงานพัฒนาและดูแลเครื่องได้ต่อเนื่องจากจุดเดียว เช่น อ่าน/แก้ไฟล์ รัน PowerShell เปิด process อ่าน stdout/stderr ส่ง stdin ตรวจ process และ port ตลอดจนเพิ่ม module ใหม่ในอนาคต

> **ค่าเริ่มต้นของ LConnect คือ Full-machine access**
>
> Filesystem สามารถเข้าถึง path ใดก็ได้ที่ Windows account ซึ่งรัน LConnect มีสิทธิ์เข้าถึง และ shell/process ทำงานด้วยสิทธิ์ของ Windows account เดียวกัน

## สถานะปัจจุบัน

LConnect Core ผ่าน runtime acceptance บน Windows 10 แล้ว โดย MCP discovery ปัจจุบันแสดง 70 tools และทดสอบจริงทั้ง filesystem, PowerShell, process/session, stdin, process-tree termination และ listening ports

## โครงสร้าง

```text
ChatGPT
  -> OpenAI Tunnel
    -> main MCP channel
      -> lconnect-mcp.mjs
        -> filesystem module
        -> shell module
        -> process/session module
        -> system module
```

ใช้ MCP server เพียงตัวเดียวบน `main` channel เพื่อให้ ChatGPT discover tools ทั้งหมดจาก catalog เดียว

## เริ่มต้นใช้งาน

1. ติดตั้ง Node.js
2. Clone repo
3. รัน `Install-LConnect.cmd`
4. ตั้งค่า OpenAI Tunnel ของคุณเองบนเครื่อง local
5. ให้ tunnel profile local ชี้ MCP command มาที่ `node "lconnect-mcp.mjs"`
6. รัน `Start-LConnect.cmd`
7. เชื่อม Tunnel ใน ChatGPT Connector
8. Refresh connector/plugin เพื่อให้ ChatGPT discover tools

**LConnect ไม่เก็บ Tunnel ID, tunnel profile หรือ Runtime API key ไว้ใน GitHub**
ไฟล์ `mcp-conf.yaml` ถูก ignore โดย Git และผู้ใช้ต้องสร้าง/ดูแลเองในเครื่อง

อ่านขั้นตอนละเอียด: [docs/INSTALLATION_TH.md](docs/INSTALLATION_TH.md)

## เอกสารภาษาไทย

- [การติดตั้ง](docs/INSTALLATION_TH.md)
- [วิธีใช้งาน](docs/USAGE_TH.md)
- [รายการ Tools](docs/TOOLS_TH.md)
- [สถาปัตยกรรม](docs/ARCHITECTURE_TH.md)
- [รูปแบบสิทธิ์และ Full-machine access](docs/ACCESS_MODEL_TH.md)
- [การแก้ปัญหา](docs/TROUBLESHOOTING_TH.md)
- [แนวทางพัฒนา Module](docs/DEVELOPMENT_TH.md)
- [Development Coordination / งานปัจจุบัน](docs/development/README.md)
- [Active Task](docs/development/ACTIVE.md)
- [Roadmap](docs/development/ROADMAP.md)
- [Task Index](docs/development/TASK_INDEX.md)

## คำสั่งหลัก

```text
Install-LConnect.cmd
Update-TunnelClient.cmd
Start-LConnect.cmd
Status-LConnect.cmd
Stop-LConnect.cmd
```

LConnect ต้องใช้ OpenAI tunnel-client `0.0.14` หรือใหม่กว่า เนื่องจากรุ่นเก่ามีปัญหา recovery ของ stdio หลัง response timeout/deadline ซึ่งอาจทำให้ process ยังขึ้นว่า ready แต่ MCP ใช้งานต่อไม่ได้

ตรวจ source และ runtime smoke tests:

```powershell
npm run check
npm test
```

## กลุ่ม Tools

### Filesystem
อ่าน เขียน แก้ไข ค้นหา ย้ายไฟล์ ดู directory tree และ metadata

### Shell
- `powershell_run`
- `command_run`

### Process / Session
- `start_process`
- `read_process_output`
- `write_process_input`
- `terminate_process`
- `list_sessions`

### Environment
- `env_get`
- `env_list`
- `env_set`
- `path_list`
- `which`

### Process Advanced
- `process_details`
- `process_tree`
- `find_process`
- `wait_process`
- `restart_process`

### Windows Services
- `list_services`
- `get_service`
- `start_service`
- `stop_service`
- `restart_service`
- `set_service_startup`

### Port / Network
- `tcp_connections`
- `udp_endpoints`
- `port_owner`
- `port_test`
- `dns_lookup`
- `network_interfaces`
- `ping_host`

### Hardware
- `cpu_info`
- `memory_info`
- `disk_info`
- `gpu_info`
- `storage_health`
- `battery_info`

### Git
- `git_status`
- `git_diff`
- `git_log`
- `git_branch`
- `git_commit`
- `git_fetch`
- `git_pull`
- `git_push`
- `git_worktree`

### Development
- `detect_project`
- `detect_build_system`
- `project_info`
- `install_dependencies`
- `run_build`
- `run_tests`
- `run_lint`

### System
- `system_info`
- `list_processes`
- `kill_process`
- `list_listening_ports`

## Full-machine access

ค่าเริ่มต้นใน `lconnect-config.json`:

```json
{
  "fullMachineAccess": true
}
```

เมื่อเปิดอยู่ filesystem จะไม่จำกัดอยู่ใน workspace เดียว แต่ยังคงถูกจำกัดโดยสิทธิ์จริงของ Windows account ที่เปิด LConnect

ถ้าต้องการลดสิทธิ์ ให้อ่าน [docs/ACCESS_MODEL_TH.md](docs/ACCESS_MODEL_TH.md)

## Tunnel configuration เป็น Local-only

Repo นี้ตั้งใจ **ไม่เก็บการกำหนด Tunnel**

สิ่งต่อไปนี้ต้องอยู่เฉพาะเครื่องผู้ใช้:

- Tunnel ID
- `mcp-conf.yaml` หรือ tunnel profile อื่น
- Runtime API key
- Organization-specific settings
- logs/runtime state

ใช้เอกสาร official ของ OpenAI tunnel-client สำหรับการสร้างและจัดการ tunnel:

- https://github.com/openai/tunnel-client/blob/master/docs/connectors.md
- https://github.com/openai/tunnel-client/blob/master/docs/configuration.md

## ระบบที่ทดสอบแล้ว

- Windows 10 x64
- Node.js 24
- Windows PowerShell 5.1
- OpenAI tunnel-client
- ChatGPT Connector ผ่าน Tunnel

โครงสร้างถูกออกแบบให้เพิ่ม module ใหม่ภายหลังได้โดยไม่ต้องเปลี่ยน tunnel-facing architecture
