# LConnect

**LConnect** คือ MCP server แบบ modular สำหรับให้ ChatGPT เข้าถึงและควบคุมเครื่อง Windows ผ่าน OpenAI Tunnel

เป้าหมายหลักของโปรเจกต์คือให้ AI สามารถทำงานพัฒนาและดูแลเครื่องได้ต่อเนื่องจากจุดเดียว เช่น อ่าน/แก้ไฟล์ รัน PowerShell เปิด process อ่าน stdout/stderr ส่ง stdin ตรวจ process และ port ตลอดจนเพิ่ม module ใหม่ในอนาคต

> **ค่าเริ่มต้นของ LConnect คือ Full-machine access**
>
> Filesystem สามารถเข้าถึง path ใดก็ได้ที่ Windows account ซึ่งรัน LConnect มีสิทธิ์เข้าถึง และ shell/process ทำงานด้วยสิทธิ์ของ Windows account เดียวกัน

## สถานะปัจจุบัน

- Source version: **1.1.0**
- MCP catalog: **91 tools**
- OpenAI tunnel-client minimum: **0.0.14**

LConnect Core ผ่าน runtime acceptance บน Windows 10 แล้ว โดย MCP discovery ปัจจุบันแสดง 91 tools และทดสอบจริงทั้ง filesystem, PowerShell, process/session, stdin, process-tree termination และ listening ports

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

สำหรับการติดตั้งครั้งแรก แนะนำให้อ่าน **[คู่มือติดตั้งแบบจับมือทำ](docs/INSTALLATION_TH.md)** ตั้งแต่ต้นจนจบ

คู่มือครอบคลุม:

1. Release ZIP vs Git clone
2. การรัน `Install-LConnect.cmd`
3. การหา Tunnel ID, Runtime API key และ Organization ID
4. การสร้าง `mcp-conf.yaml` ด้วย `tunnel-client init`
5. การเปิดไฟล์ตรวจ/แก้ค่า `tunnel_id`, `api_key`, `health.url_file` และ `main` MCP command
6. การตรวจ `lconnect-config.json` และ Full-machine access
7. การ Start / Status / อ่าน expected output
8. การเชื่อม ChatGPT Connector และ refresh tool catalog
9. First-run checklist และ troubleshooting

**LConnect ไม่เก็บ Tunnel ID, tunnel profile หรือ Runtime API key ไว้ใน GitHub**
ไฟล์ `mcp-conf.yaml` ถูก ignore โดย Git และผู้ใช้ต้องสร้าง/ดูแลเองในเครื่อง local

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

### HTTP
- `http_request`
- `http_probe`
- `http_headers`
- `http_download`

### Log Tail
- `tail_file`
- `follow_log`
- `read_log_events`
- `search_log`
- `stop_log_follow`

### File Watcher
- `watch_path`
- `watch_events`
- `watch_status`
- `stop_watch`

### Scheduled Tasks
- `list_scheduled_tasks`
- `get_scheduled_task`
- `create_scheduled_task`
- `run_scheduled_task`
- `stop_scheduled_task`
- `enable_scheduled_task`
- `disable_scheduled_task`
- `delete_scheduled_task`

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

## License

LConnect เผยแพร่ภายใต้ **MIT License**

ดูข้อความสิทธิ์ฉบับเต็มที่ [LICENSE](LICENSE)

Copyright © 2026 funggier
