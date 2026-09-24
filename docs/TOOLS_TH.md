# รายการ Tools ของ LConnect

LConnect v1.2.0 บน current `main` expose **120 tools** ผ่าน MCP `main` channel เดียว

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

เปิด process แบบ long-running และคืน control กลับเร็ว

รับ optional `label` เพื่อช่วยให้ AI session ใหม่ระบุงานเดิมได้ง่ายขึ้น

คืนค่า:

- `session_id`
- `label`
- PID
- program
- args
- cwd
- running/exit status
- `started_at`
- `completed_at`
- `streams_closed`
- sequence cursor metadata
- buffered stdout/stderr

### read_process_output

อ่าน status และ legacy stdout/stderr buffer ของ session

สามารถ `clear` legacy buffer ได้

การ clear legacy buffer **ไม่ล้าง** process event cursor history

### read_process_events

อ่าน process output/lifecycle แบบ incremental ด้วย sequence cursor

arguments:

- `session_id`
- `after_seq`
- `max_events`

event หลัก:

- `output` พร้อม `stream: stdout|stderr`
- `exit`
- `streams_closed`
- `launch_error`

คืน:

- monotonic `seq`
- `next_cursor`
- `overflowed`
- `earliest_available_seq`
- `has_more`

event buffer มีขอบเขตและเมื่อ history เก่าถูก drop จะรายงาน overflow ชัดเจน

### wait_session

รอ managed process session แบบ bounded โดยไม่ kill process เมื่อ timeout

arguments:

- `session_id`
- `timeout_seconds` สูงสุด 30 วินาทีต่อ call
- `poll_interval_ms`
- `include_output_tail`
- `output_tail_chars`

สำคัญ:

- process `exit` ถือเป็น terminal lifecycle
- `streams_closed` แยกต่างหาก เพราะ descendant อาจถือ stdout/stderr handle ต่อหลัง parent exit
- repeated terminal wait เป็น idempotent
- timeout ไม่ terminate child

### release_session

ลบ metadata/output buffers ของ **terminal session** ออกจาก memory

ถ้า session ยัง running จะ refuse และไม่ kill

ถ้าต้องการหยุด process จริงต้องใช้ `terminate_process` แยก

### prune_sessions

ล้าง terminal sessions แบบ explicit/bounded

arguments:

- `older_than_seconds`
- `dry_run` ค่า default `true`

running sessions ไม่ถูก prune อัตโนมัติ

### refresh_state

soft reconcile สำหรับ transient state ของ LConnect ที่กำลังรัน

ตรวจ:

- managed process sessions
- log followers
- file watchers

สามารถ safe-prune terminal/stopped transient handles ได้เมื่อระบุ

**ไม่ทำ:**

- restart LConnect
- kill running process
- stop active follower/watcher
- ลบ Scheduled Tasks
- stop Services
- ลบไฟล์
- แก้ Git state

### write_process_input

เขียน stdin เข้า process session

รองรับเลือกเติม newline

### terminate_process

ส่ง terminate ไปยัง process ที่เริ่มจาก LConnect session

### list_sessions

list process sessions ที่ LConnect instance ปัจจุบันรู้จัก

session อยู่ใน memory และหายเมื่อ restart LConnect

### session_status

อ่านสถานะ session เดียวแบบ compact/non-blocking โดยไม่ต้อง list ทุก session

เหมาะกับการเช็ก long-running process ระหว่าง turn:

- exact `session_id`
- running/terminal state
- exit code/signal
- started/completed timestamps
- optional bounded output tail

ค่า default ไม่คืน output เพื่อให้ payload เล็ก

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

## Hardware

Hardware tools เป็น read-only diagnostics ไม่มีการปรับ clock, fan, power limit หรือ firmware

### cpu_info

รายงาน CPU topology/identity:

- processor name/manufacturer
- core count
- logical processor count
- current/max clock
- load percentage เมื่อ Windows expose ค่า
- socket / architecture / processor ID

บน Windows ใช้ `Win32_Processor` และเก็บ Node logical processor count เป็น cross-check

### memory_info

รายงาน:

- total/free physical memory
- total/free virtual memory
- RAM modules
- capacity
- speed/configured clock
- manufacturer/part/serial
- SMBIOS memory type

ใช้ `Win32_OperatingSystem` + `Win32_PhysicalMemory`

### disk_info

inventory ทั้ง logical volumes และ physical disks:

logical:

- drive
- type
- label
- filesystem
- size/free space

physical:

- model
- interface/media type
- serial
- size/status
- partition count

### gpu_info

รายงาน graphics adapters จาก `Win32_VideoController`:

- name/vendor
- reported adapter RAM
- driver version/date
- PNP ID
- video processor
- current resolution/refresh rate เมื่อ expose
- status

หาก runtime/VM ไม่ expose GPU จะคืน `available: false` พร้อมเหตุผล แทนการเดา

### storage_health

พยายามใช้ `Get-PhysicalDisk` ก่อนเพื่ออ่าน:

- media/bus type
- health status
- operational status
- size
- serial
- poolability

ถ้า detailed storage health ใช้ไม่ได้ จะ fallback เป็น `Win32_DiskDrive.Status` และระบุ source/note ชัดเจน ไม่เรียก fallback ว่า SMART health

### battery_info

อ่าน `Win32_Battery`

บน desktop ที่ไม่มี battery จะคืน:

```json
{
  "available": false,
  "count": 0,
  "batteries": []
}
```

พร้อม note อธิบาย ไม่ถือว่าเป็น tool error

## Git

Git tools ใช้ direct `git` argv ผ่าน process execution ไม่มี shell interpolation และทุก tool รับ `repo_path` ชัดเจน

### git_status

คืน structured repository status:

- repo root
- HEAD SHA
- branch/detached/unborn
- upstream
- ahead/behind
- clean
- staged/unstaged/untracked/conflict counts
- file entries

working-tree parsing ใช้ stable Git porcelain format

### git_diff

อ่าน bounded diff

options:

- `staged`
- `name_only`
- `paths`
- `max_chars`

คืน `truncated` และ original character count เมื่อ output เกิน limit

### git_log

structured commit history:

- full/short SHA
- author
- authored time
- parents
- subject

รองรับ ref, limit และ path filters

### git_branch

actions:

- `list`
- `create`
- `switch`
- `delete`

delete ใช้ safe `-d` เป็น default; `force: true` จึงใช้ `-D`

### git_commit

สร้าง commit พร้อม exact SHA evidence

staging behavior ต้อง explicit:

- `paths` — stage เฉพาะ paths
- `all: true` — `git add -A`
- ถ้าไม่ระบุทั้งสอง ใช้ index ที่ stage อยู่ก่อนแล้ว

ไม่สามารถใช้ `all` และ `paths` พร้อมกัน

### git_fetch

fetch remote/refspec พร้อม options:

- prune
- tags

ไม่มี force behavior แฝง

### git_pull

ค่า default ใช้ `--ff-only`

สามารถระบุ remote/branch explicit ได้

คืน before/after SHA และ changed state

### git_push

push branch ไป remote

รองรับ:

- remote
- branch
- set upstream
- tags

**force push ไม่รองรับใน first contract นี้โดยตั้งใจ**

### git_worktree

actions:

- list
- add
- remove
- prune

add รองรับ existing branch หรือ `new_branch`

remove ไม่ force โดย default

## Development

### detect_project

ตรวจ project type จากไฟล์ evidence ใน project root เช่น:

- Node: `package.json`
- Python: `pyproject.toml`, `requirements.txt`
- Rust: `Cargo.toml`
- Go: `go.mod`
- .NET, Maven, Gradle, CMake, Make

ไม่เดา project type จากชื่อ folder

### detect_build_system

รายงาน build/package system และ execution support

รุ่นปัจจุบัน execute Node projects ก่อนเป็น baseline

Node package manager ตรวจจาก:

1. `packageManager` ใน package.json
2. lockfile
3. default npm

### project_info

รวม project evidence + build systems + Node package metadata เช่น scripts, engines และ dependency counts

### install_dependencies

เริ่ม dependency install แล้วคืน process `session_id` ทันที

Node managers:

- npm
- pnpm
- yarn
- bun

รองรับ frozen/ignore scripts/extra args

งานยาวอ่านผลต่อผ่าน `read_process_output`

### run_build / run_tests / run_lint

เริ่ม package script เป็น managed process session

ค่า default script:

- build
- test
- lint

รองรับเลือก script/manager/extra args/env

ถ้า project ecosystem ตรวจพบแต่ execution contract ยังไม่รองรับ จะคืน error ชัดเจนแทนการเดาคำสั่ง

## HTTP

### http_request

ส่ง HTTP request แบบ bounded

รองรับ method GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS, custom headers, text/JSON body, timeout, redirect policy และ response body mode

response body ถูกจำกัดด้วย `max_body_bytes` และรายงาน `truncated` ชัดเจน

### http_probe

probe endpoint แบบ HEAD และสามารถ fallback เป็น GET เมื่อ server ตอบ 405/501

เหมาะกับ health/readiness endpoint

### http_headers

อ่าน status + response headers ด้วย bounded HEAD request

### http_download

ดาวน์โหลด resource ไปยังไฟล์โดย:

- timeout/redirect explicit
- `max_bytes`
- default ไม่ overwrite
- temp-file แล้ว rename เมื่อสำเร็จ
- ลบ temp file เมื่อ failure
- เคารพ full-machine/restricted path policy ของ LConnect

## Log Tail

### tail_file

อ่านท้าย text log แบบ bounded byte scan และคืน last N lines

### follow_log

สร้าง background log follower แล้วคืน `follower_id` ทันที

options:

- from end หรืออ่านจากต้น
- poll interval
- bounded event buffer
- bounded bytes ต่อ poll

### read_log_events

อ่าน follower events หลัง sequence cursor โดยไม่รอ event ใหม่

event types หลัก:

- append
- truncate
- rotate
- missing/reappear
- error

ถ้า consumer ช้าจน event เก่าถูก drop จะรายงาน `overflowed` และ `dropped_through_seq`

### search_log

search ใน bounded tail region แบบ literal หรือ regex พร้อม max matches

### stop_log_follow

หยุด timer และลบ follower session

Follower state อยู่ใน memory ของ LConnect และหายเมื่อ runtime restart

## File Watcher

### watch_path

เริ่ม filesystem watcher แล้วคืน `watcher_id` ทันที

รองรับ:

- file/directory
- recursive mode เมื่อ platform รองรับ
- bounded event buffer

### watch_events

อ่าน events หลัง sequence cursor โดยไม่รอ event ใหม่

รายงาน overflow เมื่อ consumer ช้าจน event เก่าถูก drop

### watch_status

อ่านสถานะ watcher และ buffered-event metadata

### stop_watch

ปิด watcher และลบ session

หมายเหตุ: `fs.watch` เป็น OS notification source ซึ่งอาจ coalesce หรือ omit events ได้ จึงไม่ควรถูกใช้เป็น lossless audit log

## Scheduled Tasks

Scheduled Task tools เป็น structured wrapper เหนือ Windows Task Scheduler

task identity สำหรับ lifecycle/destructive operations คือ:

```text
task_path + task_name
```

ไม่มี wildcard matching สำหรับ run/stop/enable/disable/delete

### list_scheduled_tasks

list tasks แบบ bounded พร้อม filter:

- `task_path`
- `name_contains`
- `state`
- `limit`

คืน task name/path/state, principal และ settings หลัก

### get_scheduled_task

อ่าน task หนึ่งตัวด้วย exact identity พร้อม:

- actions
- triggers
- last/next run time
- last task result
- missed runs
- principal
- state/settings

### create_scheduled_task

สร้าง task สำหรับ Windows user ที่กำลังรัน LConnect โดยไม่เก็บ password

action:

- executable
- arguments
- working directory

trigger รุ่นแรก:

- `once`
- `daily`
- `at_startup`
- `at_logon`

ค่า default run level คือ `limited`; ต้องระบุ `highest` เองหากต้องการระดับสูงกว่า

ถ้า task folder ยังไม่มี LConnect จะสร้างผ่าน Task Scheduler COM

default ไม่ overwrite task เดิม; ต้องระบุ `force: true`

### run_scheduled_task / stop_scheduled_task

run/stop task ตาม exact `task_path + task_name`

### enable_scheduled_task / disable_scheduled_task

เปิด/ปิด task ตาม exact identity

### delete_scheduled_task

ลบ task ตาม exact identity โดยใช้ non-interactive confirmation

การทดสอบ mutation ใช้ disposable task/folder บน CI และ cleanup หลังจบ

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

## Structured Search / Integrity

### search_text

ค้นข้อความแบบ recursive โดยไม่ต้องเรียก PowerShell/`findstr`/`rg`

รองรับ literal/regex, include/exclude patterns, context lines, Unicode/Thai และ bounds สำหรับ files/bytes/matches/output

### file_hash / compare_files

คำนวณ digest แบบ streaming และเปรียบเทียบไฟล์สองชุดด้วย structured evidence

ใช้สำหรับ source↔installed parity, artifact verification และ recovery evidence

## Runtime / Delivery Evidence

### runtime_catalog

รายงาน catalog ที่ daemon **กำลังรันจริง**:

- version
- PID
- runtime start time
- working directory
- tool count
- stable SHA-256 digest ของชื่อ tools
- optional sorted tool names

ใช้แยกกรณี source/install ถูกอัปเดตแล้วแต่ ChatGPT/plugin schema หรือ daemon ยังเป็น catalog เก่า

### delivery_snapshot

รวม bounded local delivery evidence จาก runtime health/metrics และ LConnect telemetry เพื่อช่วยแยก handler time, tunnel queue/response metrics และ runtime identity

เป็น observation tool ไม่ใช่ root-cause predictor ของ ChatGPT UI timeout

## Structured Data / Directory Verification

### structured_data_inspect

อ่าน node ที่ต้องการจาก JSON/YAML/TOML ด้วย RFC 6901 JSON Pointer โดยไม่ต้องอ่านทั้งไฟล์เข้าคำตอบ

มี bounds สำหรับ file size, depth, container members, string length และ output

### directory_manifest

สร้าง deterministic streamed-hash manifest ของ directory tree ที่เลือก พร้อม include/exclude patterns, stability evidence และ bounded diagnostics

### compare_directories

เทียบสอง directory manifests ด้วย relative path + size + digest

ถ้า scan/hash ไม่ครบหรือ unstable จะคืน `comparison_reliable=false` และ `equal=null` แทนการสรุปเกินหลักฐาน

## Git Verification

### git_remote_ref

อ่าน exact remote ref SHA ด้วย full ref identity

### git_is_ancestor

ตรวจ exact commit ancestry แบบ structured

### git_push_ref

push exact SHA ไป exact ref โดยรักษา non-force / fast-forward safety contract

### git_sync_status

รวม local HEAD, working tree, cached tracking ref และ **exact remote ref จาก ls-remote** ใน call เดียวโดยไม่ fetch

แยก sync state เช่น:

- `equal`
- `local_ahead`
- `remote_ahead`
- `diverged`
- `remote_object_not_local`
- `remote_ref_missing`

## GitHub Actions / Release

### github_run_list

list Actions runs แบบ structured/bounded

### github_commit_run_status

หา Actions run จาก **exact 40-hex commit SHA** แล้วเลือก latest deterministic match พร้อม expand jobs/steps ใน call เดียว

เป็น network-backed direct tool และตั้งใจ **ไม่** allowlist ใน `batch_inspect`

### github_run_view / github_run_wait / github_run_failed_logs

อ่าน run/job/step evidence, short bounded wait และ failed logs

`github_run_wait` ใช้ short wait window แยกจาก status-fetch timeout และไม่ cancel workflow

### github_workflow_dispatch

dispatch exact workflow/ref พร้อม explicit inputs

### github_release_view / github_release_download

อ่าน release metadata/assets และ download exact asset แบบ bounded พร้อม local SHA-256 evidence

## Deployment Verification

### deployment_verification_snapshot

รวม post-deploy evidence ใน direct read-only call เดียว:

- exact Git-tracked source↔installed file parity
- streamed manifest digests
- source/installed package version parity
- direct dependency declarations + installed dependency presence/version
- preserved local paths เช่น `mcp-conf.yaml`, `node_modules`, `logs`, `runtime`
- running runtime version/PID/working directory/tool count/catalog digest
- optional expected tool-count match

tool นี้ **ไม่ copy/install/restart/refresh/release** และไม่ตัดสินว่า deployment หรือ release “ปลอดภัยพอ” — ChatGPT/operator ยังคงเป็น workflow owner

## Batch Inspection

### batch_inspect

รวม read-only inspection หลายรายการไว้ใน MCP call เดียวเพื่อลด round trips

ค่าเริ่มต้น:

- สูงสุด 10 operations ต่อ batch
- execute ตามลำดับที่ caller ระบุ
- `stop_on_error: false`
- `max_chars_per_result: 4000`
- `max_total_chars: 20000`

แต่ละ operation ระบุ:

- optional `id`
- `tool`
- `arguments`

เฉพาะ allowlisted **local read-only** tools เท่านั้น เช่น:

- filesystem read/inspection
- session/system/process inspection
- services/network/hardware read
- Git read รวม `git_sync_status`
- structured inspection เช่น `structured_data_inspect`, `directory_manifest`, `compare_directories`
- project/build-system detection
- log/watch event read
- Scheduled Task read
- PATH/which

Network-backed read-only tools เช่น `github_commit_run_status` ตั้งใจไม่อยู่ใน batch allowlist เพื่อรักษา contract ของ `batch_inspect` ให้เป็น local bounded inspection

ไม่อนุญาต mutation/execution เช่น:

- write/edit/move file
- shell command
- start/terminate/restart process
- Git commit/fetch/pull/push
- service mutation
- Scheduled Task mutation
- environment mutation
- HTTP request
- watcher/follower creation
- nested batch
- telemetry tool

ผลลัพธ์มี per-operation:

- `ok`
- `is_error`
- `handler_elapsed_ms`
- `result_bytes`
- `result_chars`
- `returned_chars`
- `truncated`
- bounded `result_text`

ผลรวมถูกจำกัดทั้งต่อ operation และทั้ง batch เพื่อไม่ให้การลด round trips กลายเป็น response ขนาดใหญ่แบบ unbounded

`batch_inspect` ไม่มี branching, loop, planner หรือ continuation ใด ๆ ChatGPT ยังเป็นผู้กำหนดทุก operation เอง

## Tool Telemetry

### tool_telemetry

อ่านหรือล้าง bounded metadata-only telemetry ของ LConnect Tool handlers

actions:

- `snapshot`
- `clear`

snapshot สามารถระบุ:

- `after_seq`
- `limit`
- `tool_name`
- `include_events`

metadata ที่เก็บ:

- monotonic `seq`
- MCP `request_id` เมื่อ SDK มีให้
- `tool_name`
- `handler_started_at`
- `handler_completed_at`
- `handler_elapsed_ms`
- approximate `result_bytes`
- `is_error`
- `timed_out`
- `threw`

telemetry เป็น bounded in-memory ring buffer และ **ไม่เก็บ**:

- tool arguments
- command text
- file contents
- environment values
- HTTP bodies
- result contents

ค่า default:

```json
{
  "telemetry": {
    "enabled": true,
    "maxEvents": 500
  }
}
```

environment overrides:

- `LCONNECT_TELEMETRY_ENABLED`
- `LCONNECT_TELEMETRY_MAX_EVENTS`

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
