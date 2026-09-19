# รายการ Tools ของ LConnect

LConnect Core ปัจจุบัน expose 30 tools ผ่าน MCP `main` channel เดียว

## Filesystem

### list_allowed_directories

รายงาน access scope ปัจจุบัน

เมื่อ `fullMachineAccess: true` จะรายงานว่า filesystem ใช้ full-machine access

### read_text_file / read_file

อ่านไฟล์ข้อความ

รองรับ:

- `head`
- `tail`

`read_file` เป็น alias เดิมเพื่อ compatibility

### read_multiple_files

อ่านหลายไฟล์ใน call เดียว

### read_media_file

อ่าน media/binary เป็น MCP image/audio/resource content

### write_file

สร้างหรือ overwrite ไฟล์ข้อความ

### edit_file

แทนที่ข้อความแบบ exact match และรองรับ dry run

### create_directory

สร้าง directory แบบ recursive

### list_directory

list รายการไฟล์และ directory

### list_directory_with_sizes

list พร้อมขนาดไฟล์

### directory_tree

สร้าง tree แบบ recursive เป็น JSON

### move_file

move/rename ไฟล์หรือ directory

### search_files

ค้นหาแบบ recursive ด้วย glob-style pattern

### get_file_info

ดู metadata เช่น type, size, created/modified/accessed time

## Shell

### powershell_run

รัน Windows PowerShell command

arguments หลัก:

- `command`
- `timeout_seconds`
- `cwd`

### command_run

รัน executable พร้อม argument array

arguments:

- `program`
- `args`
- `timeout_seconds`
- `cwd`

บน Windows ถ้าเป็น `.cmd/.bat` หรือ direct process launch บางกรณีล้มเหลว จะ retry ผ่าน PowerShell

## Process / Session

### start_process

เปิด process แบบ long-running

คืนค่า:

- `session_id`
- PID
- program
- args
- cwd
- status
- buffered stdout/stderr

### read_process_output

อ่าน status และ output ของ session

สามารถ `clear` buffer ได้

### write_process_input

เขียน stdin เข้า process session

รองรับเลือกเติม newline

### terminate_process

ส่ง terminate ไปยัง process ที่เริ่มจาก LConnect session

### list_sessions

list process sessions ที่ LConnect instance ปัจจุบันรู้จัก

session อยู่ใน memory และหายเมื่อ restart LConnect

## Environment

### env_get

อ่าน environment variable หนึ่งตัวจาก scope ที่ระบุ

scope:

- `process` — environment ของ LConnect process ปัจจุบัน
- `user` — persistent environment ของ Windows user
- `machine` — persistent machine environment

คืนค่าเป็น structured JSON พร้อม `exists` และ `value`

### env_list

list environment variables ตาม scope

ค่าเริ่มต้น `include_values: false` เพื่อไม่ให้ environment values เช่น token หรือ secret ถูกแสดงโดยไม่ตั้งใจ

arguments:

- `scope`
- `include_values`

### env_set

ตั้งหรือลบ environment variable

arguments:

- `name`
- `value` — ใช้ `null` เพื่อลบ
- `scope`

semantics:

- `process` เปลี่ยน environment ของ LConnect instance ปัจจุบันและ child process ที่เปิดหลังจากนั้น
- `user` / `machine` เป็น persistent Windows environment สำหรับ process ที่เปิดภายหลัง
- process ที่เปิดอยู่ก่อนแล้วจะไม่ได้รับ environment block ใหม่อัตโนมัติ
- machine scope อาจต้องใช้สิทธิ์ Windows ที่สูงพอ

### path_list

อ่าน PATH ตาม scope แล้วแยกเป็น entries พร้อมข้อมูล:

- index
- raw path
- expanded path เมื่อมี `%VARIABLE%`
- exists
- type
- duplicate

### which

ค้นหา executable/file command จาก current working directory และ PATH ของ LConnect process

บน Windows ใช้ `PATHEXT` เพื่อ resolve เช่น `.EXE`, `.CMD`, `.BAT`

arguments:

- `command`
- `all`
- `cwd`

## System

### system_info

รายงาน:

- hostname
- platform/release
- architecture
- CPU
- RAM
- uptime
- Node version
- LConnect PID
- working directory
- access mode

### list_processes

list Windows process พร้อม PID/name/path/CPU/memory เมื่ออ่านได้

### kill_process

ปิด Windows process ตาม PID

options:

- `force`
- `tree`

### list_listening_ports

แสดง TCP listening ports และ owning PID

implementation ใช้ PowerShell-hosted `netstat.exe` เพื่อหลีกเลี่ยงปัญหา `Get-NetTCPConnection` ที่พบใน runtime acceptance บางเครื่อง
