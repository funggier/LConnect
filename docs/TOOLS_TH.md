# รายการ Tools ของ LConnect

LConnect Core ปัจจุบัน expose 48 tools ผ่าน MCP `main` channel เดียว

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

## Process Advanced

### process_details

อ่านข้อมูล process ตาม PID แบบ structured พร้อม identity ที่ใช้ตรวจ PID reuse

ข้อมูลหลัก:

- PID / parent PID
- process name
- executable path
- command line
- creation time
- session ID
- working set
- handle/thread count

`creation_time` เป็นส่วนสำคัญของ process identity

### process_tree

สร้าง subtree ของ process จาก parent/child PID relationships พร้อม ancestor chain

arguments:

- `pid`
- `max_depth` (0–32)

ถ้าเกิน depth จะรายงาน `children_truncated`

### find_process

ค้นหา process ด้วย filter แบบ structured:

- `pid`
- `name`
- `executable_path`
- `command_line_contains`
- `limit`

ต้องระบุอย่างน้อยหนึ่ง filter

### wait_process

รอ process identity ที่ระบุให้ออกจากระบบแบบ bounded wait

arguments:

- `pid`
- `expected_creation_time`
- `timeout_seconds` สูงสุด 30 วินาที
- `poll_interval_ms`

การบังคับ `expected_creation_time` ป้องกันกรณี PID ถูก reuse โดย process ใหม่

ถ้า PID เดิมหายจะคืน `exited: true`

ถ้า PID ถูก reuse จะคืน:

- `reason: "pid_reused"`
- `identity_mismatch: true`

### restart_process

restart process ที่ระบุตัวตนชัดเจน

ต้องให้:

- `pid`
- `expected_creation_time`
- `program`

options:

- `args`
- `cwd`
- `force`
- `tree`
- `wait_timeout_seconds`

LConnect จะตรวจ creation time ก่อน terminate เพื่อป้องกันการ kill process คนละตัวที่ reuse PID

หลัง terminate จะ relaunch จาก `program + args` ที่ caller ระบุอย่างชัดเจน แทนการพยายาม parse/เดา original Windows command line

เพื่อหลีกเลี่ยง self-disconnect เครื่องมือนี้จะไม่ restart LConnect MCP process ของตัวเองจาก request ภายใน

## Windows Services

### list_services

list Windows services แบบ structured

filters:

- `name_contains`
- `state`
- `start_mode`
- `limit`

ข้อมูลหลัก:

- service `name`
- display name
- state
- start mode
- process ID
- service type
- account/start name
- exit code

### get_service

อ่าน service หนึ่งตัวด้วย exact Windows service `Name`

ไม่ใช้ wildcard/display name เป็น identity

ข้อมูลเพิ่มเติม:

- delayed automatic start
- `can_stop`
- `can_pause_and_continue`
- dependencies
- dependent services

### start_service

start service ตาม exact service `Name` และรอจนถึง Running

options:

- `wait_timeout_seconds` สูงสุด 60 วินาที

ถ้า service ทำงานอยู่แล้วจะเป็น idempotent และรายงาน `changed: false`

### stop_service

stop service ตาม exact service `Name`

options:

- `force`
- `wait_timeout_seconds`

ค่า default `force: false`

### restart_service

restart exact service `Name`

ถ้า service เดิม Stopped จะ start ให้แทน

options:

- `force`
- `wait_timeout_seconds`

### set_service_startup

ตั้ง startup mode:

- `automatic`
- `automatic_delayed`
- `manual`
- `disabled`

ใช้ Service Control Manager ผ่าน `sc.exe` โดย target มาจาก exact service object ที่ resolve ก่อนหน้า

การเปลี่ยน service/startup mode ยังถูกจำกัดด้วยสิทธิ์ของ Windows account ที่รัน LConnect

## Port / Network

### tcp_connections

อ่าน TCP connections แบบ structured โดยใช้ `netstat.exe -ano -p tcp` แล้ว parse ภายใน LConnect

รองรับ filters:

- state
- local/remote address
- local/remote port
- PID
- limit

เหตุผลที่ไม่ใช้ `Get-NetTCPConnection`: runtime acceptance บนเครื่องจริงเคยพบ memory pressure/OOM จาก path นี้

### udp_endpoints

อ่าน UDP endpoints ผ่าน `netstat.exe -ano -p udp`

filters:

- local address
- local port
- PID
- limit

### port_owner

ค้นหา local port ownership แล้ว correlate กับ process metadata

arguments:

- `port`
- `protocol`: `tcp`, `udp`, `both`
- `local_address`

คืน PID/process name/path เมื่ออ่านได้

### port_test

ทดสอบ TCP connect แบบ bounded timeout ด้วย Node socket

คืน:

- reachable
- elapsed time
- local/remote endpoint
- error code/message เมื่อเชื่อมไม่ได้

### dns_lookup

resolve hostname ผ่าน OS resolver

family:

- `any`
- `ipv4`
- `ipv6`

failure เช่น NXDOMAIN เป็น structured diagnostic result ไม่ใช่ exception ที่ซ่อนรายละเอียด

### network_interfaces

อ่าน local interfaces จาก Node/OS API

ข้อมูล:

- interface name
- address/family/netmask
- MAC
- internal
- CIDR
- scope ID

### ping_host

ส่ง ICMP echo แบบ bounded ด้วย .NET `System.Net.NetworkInformation.Ping`

arguments:

- host
- count สูงสุด 5
- timeout ต่อ reply สูงสุด 5000 ms

คืน structured replies และ average RTT เมื่อสำเร็จ

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
