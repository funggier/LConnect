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

1. `Stop-LConnect.cmd`
2. `Start-LConnect.cmd`
3. refresh ChatGPT connector/plugin ถ้า tool schema เปลี่ยน
