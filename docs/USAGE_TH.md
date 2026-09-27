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

สำหรับ v1.2.0 baseline คาดว่า source/runtime catalog หลัง activation จะเป็น **120 tools**

`deployment_verification_snapshot` เป็น evidence-only tool: มันไม่ copy/install/restart/release และไม่ตัดสินแทนผู้ใช้ว่า deployment พร้อมหรือไม่

## Adaptive Latency Budget

LCN-046 แยก latency เป็น **round ต่อ round** และไม่สะสมข้าม user turn

### Calibration ครั้งแรก

1. กด `ResetRound-LConnect.cmd`
2. ใช้งาน ChatGPT/LConnect ตามปกติในรอบที่ต้องการวัด
3. ถ้า ChatGPT เกิด Retry / message-delivery failure ให้กด `SetMaxLatency-LConnect.cmd` ก่อนเริ่มรอบใหม่
4. SetMaxLatency จะใช้เฉพาะ round ปัจจุบันและคำนวณ:
   - failure ceiling = cumulative tool latency ของ round ที่ยืนยัน
   - average call = failure ceiling / จำนวน work-tool calls ใน round นั้น
   - safe max = failure ceiling - average call
5. หลัง Set ระบบเปลี่ยนเป็น ENFORCE

### การใช้งานปกติหลังมี MaxLatency

ผู้ใช้ไม่ต้องกด ResetRound ทุกครั้ง

AI ต้องเรียก `latency_round_start` ก่อน LConnect work tool ตัวแรกของ user turn ใหม่ ระบบจะเริ่ม round ใหม่ด้วย:

- calls = 0
- current round latency = 0
- active MaxLatency/safe max เดิมยังอยู่

latency ของ round ก่อนหน้าไม่ถูกนำมาบวก

### ถ้าใกล้ชน Safe Max

LConnect ประเมิน next-call latency จาก average ของ confirmed failed round ล่าสุด

ถ้า predicted call จะทำให้เกิน safe max จะไม่รัน handler และคืน:

`LATENCY_BUDGET_EXCEEDED`

ถ้าอยู่ใน ENFORCE แต่ AI ยังไม่ได้เริ่ม round ใหม่ จะคืน:

`ROUND_NOT_STARTED`

### Manual controls

- `ResetRound-LConnect.cmd` — force เริ่ม round ใหม่จากศูนย์
- `SetMaxLatency-LConnect.cmd` — ยืนยันว่า current round คือรอบที่เกิด Retry และแทน active ceiling
- `ResetMaxLatency-LConnect.cmd` — ล้าง MaxLatency กลับ OBSERVE
- `StatusMaxLatency-LConnect.cmd` — ดูค่าปัจจุบัน

state อยู่ใน `runtime/latency-budget-state.json`; history อยู่ใน `runtime/latency-budget-history.jsonl` และเป็น audit-only ไม่ถูกใช้คำนวณ active budget
