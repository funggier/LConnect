# วิธีใช้งาน LConnect

## แนวคิด

เมื่อ LConnect เชื่อมกับ ChatGPT แล้ว ChatGPT จะเรียก MCP tools บนเครื่อง Windows ของคุณโดยตรง

ค่าเริ่มต้นคือ Full-machine access ดังนั้น path เช่น:

```text
C:\Windows
C:\Users
D:\Projects
T:\Workspace
```

สามารถถูกเข้าถึงได้ถ้า Windows account ที่เปิด LConnect มีสิทธิ์

## ตัวอย่างงาน

### ตรวจเครื่อง

ใช้ `system_info` เพื่อดู:

- Windows version
- CPU
- RAM
- Node version
- LConnect PID
- working directory
- access mode

### รัน PowerShell

`powershell_run` เหมาะกับ:

- Git
- build/test
- services
- environment
- registry
- network diagnostics
- Windows administration
- scripts

### รัน executable

`command_run` รับ:

- program
- argument array
- cwd
- timeout

บน Windows มี fallback ผ่าน PowerShell สำหรับ `.cmd/.bat` และ process launch failure บางชนิด

### Process แบบทำงานนาน

ลำดับทั่วไป:

```text
start_process
  -> session_id
read_process_output
write_process_input
read_process_output
terminate_process
```

เหมาะกับ:

- development server
- CLI แบบ interactive
- build/watch
- long-running test
- local model/server

### ตรวจ process

`list_processes` แสดง PID, process name, executable path, CPU และ memory เมื่อ Windows อนุญาตให้อ่าน

### ปิด process

`kill_process` ปิด process ตาม PID และสามารถเลือก process tree ได้

### ตรวจ listening ports

`list_listening_ports` ใช้ PowerShell-hosted `netstat` เพื่อรายงาน TCP listening sockets และ owning PID

## Filesystem

เครื่องมือหลัก:

- `read_text_file`
- `read_multiple_files`
- `read_media_file`
- `write_file`
- `edit_file`
- `create_directory`
- `list_directory`
- `list_directory_with_sizes`
- `directory_tree`
- `move_file`
- `search_files`
- `get_file_info`

## หลังแก้ source ของ LConnect

ถ้าแก้เฉพาะไฟล์ที่ child test โหลดใหม่ สามารถทดสอบผ่าน:

```powershell
npm run check
npm test
```

แต่ LConnect Core ที่กำลังรันอยู่จะยังใช้ module ที่โหลดไว้ตอน start

ดังนั้นเมื่อแก้ production module แล้วให้:

1. sync/deploy tracked source ไป installed directory โดย preserve local-only config/runtime ตามนโยบายของ installation
2. ใช้ `deployment_verification_snapshot` ตรวจ tracked parity, package/dependency evidence และ preserved paths ก่อน restart
3. `Stop-LConnect.cmd`
4. `Start-LConnect.cmd`
5. เรียก `runtime_catalog` หรือ `deployment_verification_snapshot` ยืนยัน running version/catalog/root
6. refresh ChatGPT connector/plugin ถ้า tool schema เปลี่ยน

สำหรับ v1.2.1 baseline คาดว่า source/runtime catalog หลัง activation จะเป็น **122 tools**

`deployment_verification_snapshot` เป็น evidence-only tool: มันไม่ copy/install/restart/release และไม่ตัดสินแทนผู้ใช้ว่า deployment พร้อมหรือไม่

## Turn-Risk Observation

ระบบปัจจุบันใช้โมเดล `turn_risk_observation_v2` แบบ **OBSERVE only** เพื่อเก็บหลักฐานของแต่ละรอบโดยไม่สร้าง MaxLatency, safe max หรือ automatic blocking

### การใช้งาน

1. AI ใช้ `latency_round_start` เพื่อเริ่มรอบใหม่จากศูนย์ก่อนงาน LConnect ของ user turn ใหม่
2. ผู้ใช้สามารถกด `ResetRound-LConnect.cmd` เมื่อต้องการบังคับเริ่มรอบใหม่เอง
3. ใช้งาน ChatGPT/LConnect ตามปกติ
4. ถ้าเห็น Retry / message-delivery failure ให้กด **`ConfirmRetry-LConnect.cmd`**
5. ใช้ `StatusTurnRisk-LConnect.cmd` เมื่อต้องการดู telemetry ปัจจุบัน

`ConfirmRetry-LConnect.cmd` เป็นคำสั่งเดียวสำหรับยืนยัน Retry ระบบจะเก็บ snapshot ของรอบปัจจุบัน หลังยืนยันแล้ว **ไม่ต้องกด ResetRound และไม่ต้องรอ AI เรียก `latency_round_start` เพื่อให้ระบบกลับมา track** — LConnect work tool ตัวแรกถัดไปจะเริ่ม observation round ใหม่อัตโนมัติและถูกนับเป็น call 1 เช่น:

- round wall-clock
- completed handler sum / max handler
- observed idle
- `tail_idle_ms`
- `max_idle_gap_ms`
- `max_observed_gap_ms`
- result bytes
- error / local timeout count

หลักสำคัญ:

- mode คงเป็น `OBSERVE`
- enforcement ปิดอยู่
- ไม่มี failure ceiling / safe max / predicted-next blocking
- history เป็น audit-only
- telemetry ของรอบก่อนหน้าไม่ถูกนำมาบวกกับรอบใหม่
- state อยู่ใน `runtime/latency-budget-state.json`
- history อยู่ใน `runtime/latency-budget-history.jsonl`

### Manual controls

- `ResetRound-LConnect.cmd` — เริ่ม observation round ใหม่จากศูนย์
- `ConfirmRetry-LConnect.cmd` — ยืนยันว่า current round คือรอบที่ผู้ใช้เห็น Retry
- `StatusTurnRisk-LConnect.cmd` — ดู turn-risk telemetry ปัจจุบัน

## ใช้ LConnect จากสมาร์ทโฟน

ถ้า ChatGPT native mobile app ไม่แสดง LConnect/MCP app ให้เปิด ChatGPT Web ผ่าน browser บนสมาร์ทโฟนด้วย account/workspace เดียวกันแทน เส้นทางนี้ผ่านการทดสอบกับ deployment ปัจจุบันแล้ว

```text
Smartphone browser
  -> ChatGPT Web
  -> LConnect MCP app
  -> OpenAI Tunnel
  -> LConnect บน Windows PC
```

มือถือไม่จำเป็นต้องอยู่เครือข่ายเดียวกับ PC แต่ PC ต้องเปิดอยู่และ LConnect/tunnel ต้อง online

## เมื่อ UI แจ้ง Error in input stream

อย่าถือว่า local execution หยุดทันที จากการตรวจเหตุการณ์จริงพบว่า ChatGPT UI สามารถแสดง `Error in input stream` ขณะที่ OpenAI Tunnel และ LConnect ยัง forward/execute tool calls ต่อได้

แนวทางที่ปลอดภัย:

1. อย่ากด Retry ทันทีถ้างานมี side effects
2. ตรวจว่า process/session หรือ LConnect activity ยังเดินต่อหรือไม่
3. แยก stream/delivery failure ออกจาก local tool failure
4. ใช้ Retry หลังยืนยันแล้วว่าการส่งซ้ำจะไม่ทำให้ action เดิมเกิดซ้ำ

ข้อสังเกตนี้เป็น evidence จาก runtime จริง ไม่ใช่การยืนยัน timeout threshold ของ ChatGPT/OpenAI

## Secure credential และ Self-Restart

LConnect สามารถเก็บ Runtime API key + Organization ID ไว้ในโฟลเดอร์โปรแกรมแบบ encrypted local state:

```text
local-secrets\credentials.json.enc
```

รูปแบบปัจจุบัน:

- Windows DPAPI
- scope: `CurrentUser`
- payload ทั้งสองค่าถูกเข้ารหัส
- directory/file ACL จำกัดให้ Windows user ปัจจุบันกับ SYSTEM
- `local-secrets/` ถูก ignore จาก Git และต้อง preserve ระหว่าง deploy/update/refresh

ตั้งค่าครั้งแรกหรือเปลี่ยนค่า:

```text
Setup-LConnectCredential.cmd
```

ตรวจโดยไม่แสดง secret:

```text
Status-LConnectCredential.cmd
```

ล้าง:

```text
Clear-LConnectCredential.cmd
```

ลำดับที่ `Start-LConnect.ps1` ใช้หา credential:

```text
parameter
  > process environment
  > stored DPAPI credential
  > interactive prompt
```

ถ้ารันแบบ non-interactive และยังหา required credential ไม่ได้ จะหยุดด้วย `CREDENTIAL_NOT_CONFIGURED` แทนการค้างรอ `Read-Host`

เมื่อมี stored credential ที่ decrypt ได้ สามารถสั่ง:

```text
Restart-LConnect.cmd
```

ได้โดย worker ภายนอกจะทำ:

```text
schedule detached worker
  -> return to caller
  -> wait briefly
  -> stop old tunnel
  -> Start-LConnect.ps1 -NonInteractive
  -> wait for /readyz
  -> write logs\restart-*.log
```

ถ้า AI เป็นคนสั่งผ่าน LConnect ให้เรียก `Restart-LConnect.ps1` ผ่าน existing `powershell_run`; script จะคืนผลว่า restart ถูก schedule ก่อน connection เดิมถูกตัด จึงไม่ต้องเพิ่ม MCP tool ใหม่และ catalog ยังคง 122 tools

ข้อจำกัด: DPAPI `CurrentUser` โดยทั่วไปใช้ไม่ได้เมื่อ copy encrypted file ไป Windows user/เครื่องอื่น ให้รัน `Setup-LConnectCredential.cmd` ใหม่บนปลายทาง
