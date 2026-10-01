# LConnect

**LConnect** คือ MCP server แบบ modular สำหรับให้ ChatGPT เข้าถึงและควบคุมเครื่อง Windows ผ่าน OpenAI Tunnel

เป้าหมายหลักของโปรเจกต์คือให้ AI สามารถทำงานพัฒนาและดูแลเครื่องได้ต่อเนื่องจากจุดเดียว เช่น อ่าน/แก้ไฟล์ รัน PowerShell เปิด process อ่าน stdout/stderr ส่ง stdin ตรวจ process และ port ตลอดจนเพิ่ม module ใหม่ในอนาคต

> **ค่าเริ่มต้นของ LConnect คือ Full-machine access**
>
> Filesystem สามารถเข้าถึง path ใดก็ได้ที่ Windows account ซึ่งรัน LConnect มีสิทธิ์เข้าถึง และ shell/process ทำงานด้วยสิทธิ์ของ Windows account เดียวกัน

## สถานะปัจจุบัน

- Source version: **1.2.1**
- MCP catalog on current `main`: **122 tools**
- Latest published release: **[v1.2.1 — Turn-Risk & Retry Reliability](https://github.com/funggier/LConnect/releases/tag/v1.2.1)**
- OpenAI tunnel-client minimum: **0.0.14**

LConnect Core ผ่าน runtime acceptance บน Windows 10 แล้ว โดย current `main` แสดง 122 tools ครอบคลุม filesystem, shell, managed process/session, system/network/hardware, Git, GitHub Actions/Release, structured inspection, runtime/delivery evidence, deployment verification และ turn-risk observation แบบไม่บล็อกการทำงาน

## ไฮไลต์ v1.2.1

- ใช้ `turn_risk_observation_v2` แบบ **OBSERVE only**
- ไม่มี MaxLatency / safe-max enforcement หรือ automatic blocking
- `ConfirmRetry-LConnect.cmd` เป็นคำสั่งเดียวสำหรับยืนยัน Retry ที่ผู้ใช้เห็น
- หลัง ConfirmRetry แล้ว work tool ตัวแรกถัดไปจะเริ่ม observation round ใหม่ให้อัตโนมัติ
- เก็บ `tail_idle_ms` และ `max_observed_gap_ms` เพื่อใช้เป็นหลักฐานเชิงเวลา
- `github_run_wait` คืนเฉพาะข้อมูลสถานะแบบ compact; ใช้ `github_run_view` เมื่อต้องการ jobs/steps เต็ม
- ยังคง 122 tools และชื่อ tools ปัจจุบันโดยไม่เพิ่ม breaking migration

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

## ใช้จากสมาร์ทโฟน

ถ้า ChatGPT native mobile app ไม่แสดง LConnect/MCP app ให้เปิด **ChatGPT Web ผ่าน browser บนสมาร์ทโฟน** ด้วย account/workspace เดียวกันแทน เส้นทางนี้ผ่านการทดสอบกับ deployment ปัจจุบันแล้วและสามารถเรียก LConnect ที่กำลังรันบน PC ผ่าน OpenAI Tunnel ได้

มือถือไม่จำเป็นต้องอยู่ LAN เดียวกับ PC แต่เครื่อง PC ต้องเปิดอยู่และ LConnect/tunnel ต้อง online

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
- [Agent Operations Reliability Plan — LCN-025–030](docs/development/AGENT_OPERATIONS_RELIABILITY_PLAN.md)
- [Task Index](docs/development/TASK_INDEX.md)

## คำสั่งหลัก

```text
Install-LConnect.cmd
Update-TunnelClient.cmd
Start-LConnect.cmd
Status-LConnect.cmd
Stop-LConnect.cmd
Restart-LConnect.cmd
Setup-LConnectCredential.cmd
Status-LConnectCredential.cmd
Clear-LConnectCredential.cmd
Refresh-LConnect.cmd
ResetRound-LConnect.cmd
ConfirmRetry-LConnect.cmd
StatusTurnRisk-LConnect.cmd
```

LConnect ต้องใช้ OpenAI tunnel-client `0.0.14` หรือใหม่กว่า เนื่องจากรุ่นเก่ามีปัญหา recovery ของ stdio หลัง response timeout/deadline ซึ่งอาจทำให้ process ยังขึ้นว่า ready แต่ MCP ใช้งานต่อไม่ได้

## Secure local credential + self-restart

LConnect รองรับการเก็บ Runtime API key และ Organization ID ไว้ในโฟลเดอร์โปรแกรมแบบเข้ารหัส:

```text
local-secrets\
└─ credentials.json.enc
```

ไฟล์นี้ใช้ **Windows DPAPI / CurrentUser** และโฟลเดอร์ถูกจำกัด ACL ให้ Windows user ปัจจุบันกับ SYSTEM เท่านั้น ค่าจริงไม่ถูกเก็บเป็น plaintext และ DPAPI key material ไม่ถูกเก็บไว้ข้างไฟล์

ลำดับ credential ของ `Start-LConnect.ps1`:

```text
explicit parameter
  > process environment
  > local encrypted DPAPI file
  > interactive prompt
```

ถ้าเป็นการเปิดครั้งแรกและไม่มี credential ที่ใช้ได้ `Start-LConnect.cmd` จะถาม Runtime API key / Organization ID และถามว่าจะบันทึกแบบเข้ารหัสไว้หรือไม่ โดยค่าเริ่มต้นคือบันทึก

คำสั่งจัดการ:

- `Setup-LConnectCredential.cmd` — สร้าง/เปลี่ยน encrypted credential
- `Status-LConnectCredential.cmd` — ทดสอบว่าไฟล์อยู่และ decrypt ได้ โดยไม่แสดง secret
- `Clear-LConnectCredential.cmd` — ลบ encrypted credential file
- `Restart-LConnect.cmd` — schedule detached worker ให้ stop → start แบบ non-interactive

`Restart-LConnect.cmd` ต้องมี stored credential ที่ decrypt ได้ เพื่อไม่ต้องส่ง Runtime API key ผ่าน command line ระหว่าง self-restart

> DPAPI `CurrentUser` ผูกกับ Windows user/เครื่องเดิม การ copy `credentials.json.enc` ไปอีก user หรืออีกเครื่องโดยทั่วไปจะ decrypt ไม่ได้ ให้รัน `Setup-LConnectCredential.cmd` ใหม่

## Timeout containment

LConnect แยกงาน synchronous สั้นออกจากงาน local ที่ใช้เวลานาน เพื่อไม่ให้ MCP request หนึ่งรอบต้องค้างรอโดยไม่จำเป็น

ค่าเริ่มต้นใน `lconnect-config.json`:

```json
{
  "mcp": {
    "maxSynchronousRequestSeconds": 15
  }
}
```

ค่านี้เป็น **LConnect-side containment budget** ไม่ใช่ timeout ที่ OpenAI/ChatGPT รับประกันหรือเปิดเผย และสามารถ override ได้ด้วย environment variable `LCONNECT_MAX_SYNCHRONOUS_REQUEST_SECONDS`

หลักการใช้งาน:

- `powershell_run`, `command_run` และ synchronous child-process helpers ถูกจำกัดด้วย budget นี้
- `wait_session` ใช้ short bounded wait; timeout ของการรอไม่ terminate process
- งานที่คาดว่าจะใช้เวลานานควรเริ่มด้วย `start_process` แล้วติดตามด้วย `wait_session`, `read_process_events` หรือ `read_process_output`
- HTTP timeout ครอบทั้งการรอ response และการอ่าน body/download
- ถ้า ChatGPT UI/connection timeout เอง LConnect ไม่สามารถป้องกันเหตุการณ์นั้นได้ทั้งหมด และงาน local ที่เริ่มไว้แล้วอาจยังเดินต่อ

```text
short synchronous work
  -> bounded response

long local work
  -> start_process
  -> session_id
  -> process continues independently
  -> short wait/read calls
```

## Turn-Risk Observation

ระบบปัจจุบันใช้ `turn_risk_observation_v2` เพื่อเก็บหลักฐานของรอบที่เกิด Retry/message-delivery failure โดยไม่เดา threshold และไม่บล็อก tool calls

- `ResetRound-LConnect.cmd` — บังคับเริ่ม observation round ใหม่
- `ConfirmRetry-LConnect.cmd` — ยืนยันว่า current round คือรอบที่ผู้ใช้เห็น Retry
- `StatusTurnRisk-LConnect.cmd` — ดู telemetry ปัจจุบัน
- หลัง ConfirmRetry แล้ว work tool ตัวแรกถัดไป auto-start round ใหม่
- telemetry เป็นหลักฐาน correlation ไม่ใช่ข้อพิสูจน์ root cause ของ ChatGPT/platform timeout

หาก UI แสดง `Error in input stream` อย่าถือว่า LConnect หยุดโดยอัตโนมัติ จากการทดสอบจริงพบว่า tunnel/LConnect อาจยังทำงานต่อหลัง UI แจ้ง error ได้ ควรตรวจ activity ก่อนกด Retry โดยเฉพาะงานที่มี side effects เพื่อหลีกเลี่ยงการทำซ้ำ

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
- `read_process_events`
- `wait_session`
- `release_session`
- `prune_sessions`
- `write_process_input`
- `terminate_process`
- `list_sessions`
- `session_status`
- `refresh_state`

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
- `git_remote_ref`
- `git_is_ancestor`
- `git_push_ref`
- `git_sync_status`

### Structured Inspection / Integrity
- `search_text`
- `file_hash`
- `compare_files`
- `structured_data_inspect`
- `directory_manifest`
- `compare_directories`
- `deployment_verification_snapshot`

### GitHub Actions / Release
- `github_run_list`
- `github_commit_run_status`
- `github_run_view`
- `github_run_wait`
- `github_run_failed_logs`
- `github_workflow_dispatch`
- `github_release_view`
- `github_release_download`

### Runtime / Delivery Evidence
- `runtime_catalog`
- `delivery_snapshot`

### Turn-Risk
- `latency_round_start`
- `latency_budget_status`

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

### Batch Inspection
- `batch_inspect`

รวม explicit read-only inspections สูงสุด 10 operations ไว้ใน MCP round trip เดียว โดยใช้ allowlist, ordered execution, result bounds และ stop-on-error ที่กำหนดชัดเจน เพื่อช่วยลด accumulated Tool delivery overhead โดยไม่สร้าง workflow engine

### Tool Telemetry
- `tool_telemetry`

ใช้สำหรับอ่าน/ล้าง bounded metadata-only telemetry ของ Tool handlers เช่น request ID, tool name, handler timing, result size, error/timeout state โดยไม่บันทึก arguments, command contents, file contents, environment values หรือ result contents

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
- Runtime API key (เก็บ persistent ได้เฉพาะใน `local-secrets/credentials.json.enc` แบบ DPAPI)
- Organization-specific settings
- `local-secrets/`
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
- ChatGPT Web ผ่าน browser บนสมาร์ทโฟน

โครงสร้างถูกออกแบบให้เพิ่ม module ใหม่ภายหลังได้โดยไม่ต้องเปลี่ยน tunnel-facing architecture

## License

LConnect เผยแพร่ภายใต้ **MIT License**

ดูข้อความสิทธิ์ฉบับเต็มที่ [LICENSE](LICENSE)

Copyright © 2026 funggier