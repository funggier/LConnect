# การติดตั้ง LConnect แบบจับมือทำ — สำหรับการใช้งานครั้งแรก

เอกสารนี้ออกแบบให้ผู้ใช้ Windows ที่ยังไม่เคยติดตั้ง LConnect สามารถทำตามได้ทีละขั้น โดยไม่ต้องเดาว่าไฟล์ไหนต้องแก้ ค่าไหนต้องใส่ และหลัง Start แล้วอะไรถือว่าปกติ

> **สำคัญ**
>
> LConnect ตั้งค่าเริ่มต้นเป็น **Full-machine access**
>
> Filesystem, PowerShell, process และ system tools สามารถทำงานได้ทุก path หรือส่วนของเครื่องที่ Windows account ซึ่งรัน LConnect มีสิทธิ์เข้าถึง
>
> ถ้าไม่ต้องการสิทธิ์ระดับนี้ ให้อ่าน [ACCESS_MODEL_TH.md](ACCESS_MODEL_TH.md) ก่อนใช้งานจริง

---

# ภาพรวมสิ่งที่จะได้หลังติดตั้ง

โฟลเดอร์ LConnect จะมีโครงสร้างประมาณนี้:

```text
LConnect\
├─ lconnect-mcp.mjs
├─ lconnect-config.json
├─ mcp-conf.yaml              <- คุณสร้างเองในเครื่อง local
├─ tunnel-client.exe          <- installer ดาวน์โหลดให้
├─ node_modules\             <- installer สร้างให้
├─ runtime\                  <- installer สร้างให้
├─ logs\                     <- installer สร้างให้
├─ Install-LConnect.cmd
├─ Start-LConnect.cmd
├─ Status-LConnect.cmd
├─ Stop-LConnect.cmd
└─ Refresh-LConnect.cmd
```

ข้อมูลต่อไปนี้ **ไม่ควรถูกเก็บใน GitHub**:

- Tunnel ID จริงของคุณ
- `mcp-conf.yaml`
- Runtime API key
- Organization-specific secret
- `runtime/`
- `logs/`
- `tunnel-client.exe`

---

# ขั้นที่ 1 — เตรียมโปรแกรมที่ต้องมี

ต้องมี:

- Windows 10 หรือ Windows 11
- Node.js 20 หรือใหม่กว่า
- npm
- Git — จำเป็นเมื่อใช้ Git clone
- สิทธิ์ใช้งาน OpenAI Secure MCP Tunnel
- Tunnel ID
- Runtime API key
- Organization ID

LConnect ผ่านการทดสอบหลักบน:

- Windows 10 x64
- Node.js 24
- Windows PowerShell 5.1

## 1.1 ตรวจ Node.js และ npm

เปิด PowerShell แล้วรัน:

```powershell
node --version
npm --version
```

Node ต้องเป็น 20 หรือใหม่กว่า

ตัวอย่าง:

```text
v24.x.x
11.x.x
```

ถ้าไม่รู้จักคำสั่ง `node` หรือ `npm` ให้ติดตั้ง Node.js แล้วเปิด PowerShell ใหม่

## 1.2 ตรวจ Git — เฉพาะกรณีใช้ Git clone

```powershell
git --version
```

---

# ขั้นที่ 2 — เอา LConnect ลงเครื่อง

มี 2 วิธี

## วิธี A — Release ZIP — แนะนำสำหรับผู้ใช้ทั่วไป

1. เปิดหน้า Releases ของ LConnect:

```text
https://github.com/funggier/LConnect/releases/latest
```

2. ดาวน์โหลด ZIP ของ release ล่าสุด
3. แตก ZIP ไปยังโฟลเดอร์ถาวร

ตัวอย่าง:

```text
T:\LConnect
```

หรือ:

```text
C:\Tools\LConnect
```

ไม่แนะนำให้ใช้งานระยะยาวจาก Downloads หรือ Temp

หลังแตก ZIP แล้ว ควรเห็นไฟล์:

```text
Install-LConnect.cmd
Start-LConnect.cmd
Status-LConnect.cmd
lconnect-mcp.mjs
lconnect-config.json
```

## วิธี B — Git clone — สำหรับคนที่ต้องการ update source ด้วย Git

เปิด PowerShell:

```powershell
git clone https://github.com/funggier/LConnect.git
cd LConnect
```

---

# ขั้นที่ 3 — ติดตั้ง dependency และ tunnel-client

เข้าไปอยู่ในโฟลเดอร์ LConnect ก่อน

ตัวอย่าง:

```powershell
cd T:\LConnect
```

จากนั้นดับเบิลคลิก:

```text
Install-LConnect.cmd
```

หรือรัน:

```powershell
.\Install-LConnect.ps1
```

Installer จะ:

1. ตรวจ `node` และ `npm`
2. รัน `npm install --omit=dev`
3. สร้าง `node_modules/`
4. สร้าง `runtime/`
5. สร้าง `logs/`
6. ดาวน์โหลด official `tunnel-client.exe`
7. ตรวจ tunnel-client version

LConnect ต้องใช้ tunnel-client **0.0.14 หรือใหม่กว่า**

## Installer จะไม่ทำอะไร

Installer ตั้งใจ **ไม่**:

- สร้าง OpenAI Tunnel
- เลือก Tunnel ให้คุณ
- สร้าง `mcp-conf.yaml`
- เก็บ Runtime API key
- เก็บ Organization ID
- แก้ ChatGPT Connector

ดังนั้นหลัง Install เสร็จ ต้องทำขั้นต่อไปด้วยตัวเอง

---

# ขั้นที่ 4 — เตรียมค่า OpenAI 3 ตัว

ต้องมี:

| ค่า | รูปแบบ | ใช้ตรงไหน |
|---|---|---|
| Tunnel ID | `tunnel_...` | ใส่ใน `mcp-conf.yaml` |
| Runtime API key | secret key | กรอกตอน Start |
| Organization ID | `org_...` | กรอกตอน Start |

## 4.1 Tunnel ID

เปิด:

```text
https://platform.openai.com/settings/organization/tunnels
```

สร้างหรือเลือก tunnel ที่ต้องการใช้กับ LConnect แล้ว copy Tunnel ID

ในคู่มือนี้จะใช้ placeholder:

```text
<YOUR_TUNNEL_ID>
```

ต้องเปลี่ยนเป็น Tunnel ID จริงของคุณก่อนรันคำสั่ง

## 4.2 Runtime API key

เปิด:

```text
https://platform.openai.com/settings/organization/api-keys
```

สำหรับ daemon ของ LConnect ให้ใช้ Runtime API key ที่มีสิทธิ์ **Tunnels Read + Use**

ไม่ควรใช้ Admin key เป็น runtime key ระยะยาว

เมื่อสร้างแล้ว ให้เก็บ secret ไว้ในที่ปลอดภัย

**อย่าใส่ secret key จริงลง `mcp-conf.yaml`**

LConnect ใช้ reference นี้แทน:

```yaml
api_key: "env:CONTROL_PLANE_API_KEY"
```

`Start-LConnect.ps1` จะนำ key ที่คุณกรอกไปใส่ environment variable ชั่วคราวให้เอง

## 4.3 Organization ID

เปิด:

```text
https://platform.openai.com/settings/organization/general
```

หรือ OpenAI Platform > Organization settings > General

หา Organization ID ซึ่งมีรูปแบบ:

```text
org_...
```

ในคู่มือนี้จะเรียกว่า:

```text
<YOUR_ORGANIZATION_ID>
```

Organization ID ไม่ใช่ชื่อ Organization

---

# ขั้นที่ 5 — สร้าง `mcp-conf.yaml`

ไฟล์นี้ต้องอยู่ที่ root ของ LConnect:

```text
<LConnect folder>\mcp-conf.yaml
```

ตัวอย่าง:

```text
T:\LConnect\mcp-conf.yaml
```

## 5.1 วิธีแนะนำ — ให้ tunnel-client สร้าง profile ให้

เปิด PowerShell ในโฟลเดอร์ LConnect

ตัวอย่าง:

```powershell
cd T:\LConnect
```

จากนั้นรันคำสั่งนี้ โดยเปลี่ยน `<YOUR_TUNNEL_ID>` เป็น Tunnel ID จริงก่อน:

```powershell
.\tunnel-client.exe init `
  --profile mcp-conf `
  --profile-dir "." `
  --tunnel-id "<YOUR_TUNNEL_ID>" `
  --mcp-command 'node "lconnect-mcp.mjs"' `
  --health-listen-addr "127.0.0.1:18020"
```

เหตุผลที่ใช้:

```text
--profile mcp-conf
--profile-dir "."
```

คือเพื่อให้ tunnel-client สร้างไฟล์:

```text
mcp-conf.yaml
```

ตรง root ของ LConnect

ถ้ามีไฟล์นี้อยู่แล้ว tunnel-client จะไม่ overwrite โดย default

อย่าใช้ `--force` จนกว่าคุณตั้งใจเขียนทับ profile เดิมจริง ๆ

---

# ขั้นที่ 6 — เปิด `mcp-conf.yaml` แล้วตรวจ 4 จุด

เปิดด้วย Notepad:

```powershell
notepad .\mcp-conf.yaml
```

ไฟล์ที่สร้างจาก `tunnel-client init` จะมีโครงสร้างใกล้เคียงตัวอย่างด้านล่าง

> ตัวอย่างนี้เป็น reference ที่ใช้ placeholder เท่านั้น
>
> Repo ไม่แจก profile จริง และ profile ของคุณต้องอยู่เฉพาะเครื่อง local

```yaml
config_version: 1

control_plane:
  base_url: "https://api.openai.com"
  tunnel_id: "<YOUR_TUNNEL_ID>"
  api_key: "env:CONTROL_PLANE_API_KEY"

health:
  listen_addr: "127.0.0.1:18020"
  url_file: "runtime/health-url.txt"

admin_ui:
  open_browser: false

log:
  level: info
  format: json

mcp:
  commands:
    - channel: main
      command: 'node "lconnect-mcp.mjs"'
```

## จุดที่ 1 — `control_plane.tunnel_id`

ต้องเป็น Tunnel ID จริงของคุณ

ถูก:

```yaml
tunnel_id: "<YOUR_REAL_TUNNEL_ID>"
```

ผิด:

```yaml
tunnel_id: "<YOUR_TUNNEL_ID>"
```

ถ้ายังเป็น placeholder แปลว่ายังไม่ได้ใส่ค่าจริง

## จุดที่ 2 — `control_plane.api_key`

ควรเป็น:

```yaml
api_key: "env:CONTROL_PLANE_API_KEY"
```

**อย่าเขียน secret key จริงตรงนี้**

## จุดที่ 3 — MCP channel และ command

ต้องมี channel:

```yaml
channel: main
```

command ต้องเปิด LConnect MCP server:

```yaml
command: 'node "lconnect-mcp.mjs"'
```

รูปแบบที่ `tunnel-client init` สร้างเป็น:

```yaml
command: "node lconnect-mcp.mjs"
```

ก็ใช้ได้ เพราะ `Start-LConnect.ps1` เปิด tunnel-client จาก root ของ LConnect

## จุดที่ 4 — `health.url_file`

ให้เพิ่มบรรทัดนี้ใต้ `health:` ถ้ายังไม่มี:

```yaml
url_file: "runtime/health-url.txt"
```

ตัวอย่าง:

```yaml
health:
  listen_addr: "127.0.0.1:18020"
  url_file: "runtime/health-url.txt"
```

LConnect ใช้ไฟล์นี้ให้ `Status-LConnect.cmd` หา health endpoint

## ถ้า port 18020 ถูกใช้แล้ว

เปลี่ยน:

```yaml
listen_addr: "127.0.0.1:18020"
```

เป็น:

```yaml
listen_addr: "127.0.0.1:0"
```

เลข `0` หมายถึงให้ Windows เลือก port ว่างให้

กรณีนี้ต้องมี:

```yaml
url_file: "runtime/health-url.txt"
```

เพื่อให้ Status รู้ว่า port จริงคืออะไร

---

# ขั้นที่ 7 — ตรวจ `lconnect-config.json`

เปิด:

```powershell
notepad .\lconnect-config.json
```

ค่า default:

```json
{
  "fullMachineAccess": true,
  "allowedDirectories": [".."],
  "shell": {
    "enabled": true,
    "maxOutputChars": 120000,
    "defaultTimeoutSeconds": 60,
    "maxTimeoutSeconds": 600
  },
  "process": {
    "maxBufferedOutputChars": 240000
  }
}
```

## `fullMachineAccess`

ค่า default:

```json
"fullMachineAccess": true
```

หมายถึง filesystem tools สามารถเข้าถึงทุก path ที่ Windows account นี้มีสิทธิ์

เมื่อเป็น `true` ค่า `allowedDirectories` ไม่ใช่ตัวจำกัด filesystem หลัก

## `shell.enabled`

ค่า default:

```json
"enabled": true
```

เปิด PowerShell, command execution และ modules ที่ต้องใช้ execution

## timeout

```json
"defaultTimeoutSeconds": 60,
"maxTimeoutSeconds": 600
```

นี่เป็น timeout ของ shell layer

งานที่นาน เช่น build/test/server ควรใช้ session model เช่น:

```text
start_process
read_process_output
terminate_process
```

Development tools ของ LConnect ใช้ session model เดียวกัน

## ถ้าต้องการจำกัด filesystem

ดู:

```text
config\lconnect-config.restricted.example.json
```

และอ่าน [ACCESS_MODEL_TH.md](ACCESS_MODEL_TH.md)

---

# ขั้นที่ 8 — ตรวจไฟล์สำคัญก่อน Start

รัน:

```powershell
Test-Path .\tunnel-client.exe
Test-Path .\mcp-conf.yaml
Test-Path .\lconnect-mcp.mjs
Test-Path .\lconnect-config.json
Test-Path .\node_modules
```

ควรได้:

```text
True
True
True
True
True
```

ตรวจ tunnel-client version:

```powershell
.\tunnel-client.exe --version
```

ต้องเป็น **0.0.14 หรือใหม่กว่า**

---

# ขั้นที่ 9 — Start LConnect ครั้งแรก

รัน:

```text
Start-LConnect.cmd
```

หรือ:

```powershell
.\Start-LConnect.ps1
```

Launcher จะถาม 2 ค่า

## คำถามที่ 1

```text
OpenAI Runtime API key (input is hidden)
```

วาง Runtime API key

ตอนวางจะไม่เห็นตัวอักษรบนหน้าจอ เป็นพฤติกรรมปกติ

Key ถูกใช้ผ่าน environment variable ชั่วคราว และ LConnect ไม่เขียนลง profile/repo

## คำถามที่ 2

```text
OpenAI Organization ID (org_...)
```

วาง Organization ID จริงของคุณ

## สิ่งที่ Start script ทำก่อนเปิด daemon

Start script จะ:

1. ตรวจ `tunnel-client.exe`
2. ตรวจ tunnel-client version
3. ตรวจ `mcp-conf.yaml`
4. ตรวจ Node/npm
5. ตรวจ dependency
6. รัน `tunnel-client doctor`
7. ถ้า doctor ผ่านจึงเริ่ม tunnel-client
8. เก็บ PID ใน `runtime/`
9. เก็บ stdout/stderr ใน `logs/`

ถ้า doctor ไม่ผ่าน LConnect จะไม่ฝืน Start

---

# ขั้นที่ 10 — ถ้า Start สำเร็จควรเห็นอะไร

ตัวอย่าง:

```text
Tunnel client: 0.0.14+...
LConnect started (PID 12345, FULL CONTROL: filesystem + shell + process + system).
Run Status-LConnect.cmd to check readiness.
```

PID จะต่างกันในแต่ละเครื่อง

จากนั้นรัน:

```text
Status-LConnect.cmd
```

---

# ขั้นที่ 11 — อ่านผล Status

สถานะที่ดีควรมีประมาณนี้:

```text
Tunnel client: 0.0.14+...
Process: running (PID ...)
Liveness: 200 live
Startup readiness: 200 ready
Control-plane health: PASS
```

บาง tunnel-client version อาจแสดง:

```text
MCP component health: unavailable in this tunnel-client version (optional diagnostic).
```

กรณีนี้ไม่ถือว่า fail โดยตัวมันเอง

โดยเฉพาะ tunnel-client 0.0.14 ที่ LConnect ผ่าน acceptance แล้ว อาจไม่มี `/health/mcp` route

สิ่งสำคัญ:

- process ต้อง running
- liveness ต้องผ่าน
- readiness ต้องผ่าน
- control-plane health ต้องผ่าน

> `/readyz = 200 ready` อย่างเดียวไม่ยืนยันว่า tool call ใช้งานได้จริง 100%
>
> หลังเชื่อม ChatGPT แล้วควรทดสอบ tool call จริงอีกครั้ง

---

# ขั้นที่ 12 — เชื่อม ChatGPT Connector

เปิด:

```text
https://chatgpt.com/#settings/Connectors
```

ต้องให้ LConnect/tunnel-client ยัง running อยู่ระหว่างตั้ง connector

เลือก Connection แบบ **Tunnel**

จากนั้น:

1. เลือก tunnel ที่สร้างไว้ หรือใส่ Tunnel ID ตาม UI
2. บันทึก connector
3. กลับเข้า ChatGPT
4. Refresh connector/plugin หากจำเป็น

LConnect v1.2.0 baseline มี **120 tools**

หลัง refresh ที่ถูกต้อง ChatGPT ควร discover catalog รุ่นใหม่

---

# ขั้นที่ 13 — ทดสอบจาก ChatGPT

เริ่มจาก read-only tool

ตัวอย่าง:

```text
ลองใช้ LConnect ตรวจ system_info
```

ต่อด้วย:

```text
ลองใช้ LConnect list_allowed_directories
```

หรือ:

```text
ใช้ LConnect ดู cpu_info และ memory_info
```

ถ้าเพิ่ง update source แล้วเห็น tools ไม่ครบ ให้ restart runtime และ refresh connector/plugin

---

# ขั้นที่ 14 — ทดสอบ Core จากเครื่องโดยตรง

รัน:

```powershell
npm run check
npm test
```

`npm run check` ตรวจ syntax ของ Core/modules/tests

`npm test` เปิด child MCP server จริงและทดสอบ integration fixtures

สำหรับ LConnect v1.2.0 release baseline คาดว่าจะเห็น:

```text
PASS tools=120
```


หมายเหตุ: destructive/system mutation บางประเภทถูกทดสอบเต็มรูปแบบบน disposable CI environment ส่วน local tests จะหลีกเลี่ยงการเปลี่ยน service/task จริงโดยไม่จำเป็น

---

# ขั้นที่ 15 — Stop / Restart / Refresh

หยุด:

```text
Stop-LConnect.cmd
```

เริ่มใหม่:

```text
Start-LConnect.cmd
```

ตรวจ:

```text
Status-LConnect.cmd
```

## Offline clean refresh

ถ้าคุณหยุดใช้งานกลางคัน, เปลี่ยน AI/ChatGPT session แล้วต้องการเริ่ม LConnect ใหม่จาก generated state ที่สะอาด ให้ใช้:

```text
Stop-LConnect.cmd
Refresh-LConnect.cmd
Start-LConnect.cmd
```

`Refresh-LConnect.cmd` ใช้ตอน LConnect **หยุดแล้วเท่านั้น**

ค่า default จะล้าง:

- `runtime/*`
- `logs/*`

จากนั้นสร้าง `runtime/` และ `logs/` เปล่ากลับมา

สิ่งที่ **ไม่ล้าง**:

- `mcp-conf.yaml`
- `lconnect-config.json`
- `tunnel-client.exe`
- `node_modules/`
- source/docs
- Windows Scheduled Tasks
- Windows Services
- user files
- Git state

ถ้ายังต้องการเก็บ logs เป็นหลักฐาน:

```text
Refresh-LConnect.cmd -KeepLogs
```

ถ้า LConnect tunnel process ยังทำงานอยู่ Refresh จะ refuse และบอกให้ Stop ก่อน เพื่อไม่ให้ล้าง state ขณะ runtime ยัง active

---

# ขั้นที่ 16 — อัปเดต tunnel-client ภายหลัง

ถ้าต้องการอัปเดต tunnel-client:

```text
Stop-LConnect.cmd
Update-TunnelClient.cmd
Start-LConnect.cmd
```

Updater จะไม่แก้:

- Tunnel ID
- `mcp-conf.yaml`
- Runtime API key
- Organization ID
- tunnel profile อื่นของคุณ

---

# ขั้นที่ 17 — อัปเกรด LConnect ภายหลัง

ก่อน update แนะนำให้หยุด:

```text
Stop-LConnect.cmd
```

จากนั้น update source หรือแตก Release ใหม่

ต้องเก็บ local-only configuration ของคุณไว้:

- `mcp-conf.yaml`
- ค่าใน `lconnect-config.json` ที่คุณตั้งใจแก้
- secret ที่เก็บภายนอก repo

หลัง update:

```text
Install-LConnect.cmd
Start-LConnect.cmd
Status-LConnect.cmd
```

ถ้ามี tool catalog ใหม่ ให้ Refresh connector/plugin ใน ChatGPT

---

# Troubleshooting

## ปัญหา: Start บอกว่าไม่มี `mcp-conf.yaml`

Installer ตั้งใจไม่สร้างไฟล์นี้

กลับไปทำ **ขั้นที่ 5**

ตรวจ:

```powershell
Test-Path .\mcp-conf.yaml
```

ต้องได้:

```text
True
```

## ปัญหา: doctor ตอบ 401

ตรวจ:

- Runtime API key ถูกตัวหรือไม่
- key ถูก revoke หรือไม่
- ไม่ได้ใช้ placeholder
- Start script รับ key ตอน prompt จริงหรือไม่

## ปัญหา: doctor/polling ตอบ 403

ตรวจ:

- Runtime API key มี **Tunnels Read + Use**
- Tunnel ID เป็น tunnel ที่ key นี้มีสิทธิ์ใช้
- Organization ID ถูก organization
- ไม่ได้ใช้ key จากคนละ organization/project โดยไม่ตั้งใจ

## ปัญหา: Status บอก Process stopped

ดู log ล่าสุด:

```powershell
Get-ChildItem .\logs\tunnel-*.err.log |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1 |
  Get-Content
```

และ:

```powershell
Get-Content .\logs\doctor-latest.log
```

## ปัญหา: port 18020 ถูกใช้

แก้ใน `mcp-conf.yaml`:

```yaml
health:
  listen_addr: "127.0.0.1:0"
  url_file: "runtime/health-url.txt"
```

แล้ว Stop/Start ใหม่

## ปัญหา: ChatGPT เห็น Tunnel แต่ไม่เห็น tools

ตรวจตามลำดับ:

1. LConnect ยัง running หรือไม่
2. `Status-LConnect.cmd` ผ่านหรือไม่
3. `mcp-conf.yaml` มี `channel: main` หรือไม่
4. MCP command ชี้ `lconnect-mcp.mjs` หรือไม่
5. Refresh connector/plugin แล้วหรือยัง
6. ถ้าเพิ่งเปลี่ยน source/module ให้ restart runtime แล้ว refresh

## ปัญหา: process ยัง running แต่ tool call ใช้ไม่ได้หลัง timeout

ตรวจ:

```powershell
.\tunnel-client.exe --version
```

ต้องเป็น 0.0.14 หรือใหม่กว่า

ถ้าต่ำกว่า:

```text
Stop-LConnect.cmd
Update-TunnelClient.cmd
Start-LConnect.cmd
```

งานยาวควรใช้ process/session model แทน blocking call เดียว

---

# First-run checklist

ก่อนถือว่าติดตั้งเสร็จ ให้เช็ก:

- [ ] Node.js 20+ ทำงาน
- [ ] รัน `Install-LConnect.cmd` สำเร็จ
- [ ] มี `tunnel-client.exe` 0.0.14+
- [ ] มี Tunnel ID จริง
- [ ] มี Runtime API key ที่มี Tunnels Read + Use
- [ ] รู้ Organization ID
- [ ] สร้าง `mcp-conf.yaml` แล้ว
- [ ] `tunnel_id` ใน profile ถูกต้อง
- [ ] `api_key` เป็น `env:CONTROL_PLANE_API_KEY`
- [ ] MCP channel เป็น `main`
- [ ] MCP command ชี้ `lconnect-mcp.mjs`
- [ ] มี `health.url_file: "runtime/health-url.txt"`
- [ ] ตรวจ `lconnect-config.json` แล้ว
- [ ] เข้าใจว่า default เป็น Full-machine access
- [ ] Start ผ่าน doctor
- [ ] Status ผ่าน liveness/readiness/control-plane
- [ ] เชื่อม Tunnel ใน ChatGPT Connector แล้ว
- [ ] Refresh connector/plugin แล้ว
- [ ] ทดสอบ LConnect tool call จริงอย่างน้อย 1 ครั้ง

---

# Secret / Local configuration boundary

ห้าม commit หรือแชร์:

- Runtime API key
- Admin API key
- private certificates/keys
- `mcp-conf.yaml` ที่มี Tunnel ID จริง
- `.env` ที่มี secret
- logs ที่อาจมี sensitive data โดยไม่ตรวจ redaction

`.gitignore` ของ LConnect ป้องกันหลาย path อยู่แล้ว:

```text
runtime/
logs/
node_modules/
tunnel-client.exe
mcp-conf.yaml
mcp-conf*.yaml
*.local.yaml
*.secret
.env
.env.*
```

แต่ `.gitignore` ไม่ใช่ตัวแทนของการตรวจ secret ก่อน commit

---

# ลิงก์อ้างอิง OpenAI

Tunnel management:

```text
https://platform.openai.com/settings/organization/tunnels
```

Runtime API keys:

```text
https://platform.openai.com/settings/organization/api-keys
```

Admin API keys:

```text
https://platform.openai.com/settings/organization/admin-keys
```

ChatGPT Connector settings:

```text
https://chatgpt.com/#settings/Connectors
```

Official tunnel-client onboarding:

```text
https://github.com/openai/tunnel-client/blob/master/docs/onboarding.md
```

Official tunnel-client configuration reference:

```text
https://github.com/openai/tunnel-client/blob/master/docs/configuration.md
```

Official connector behavior:

```text
https://github.com/openai/tunnel-client/blob/master/docs/connectors.md
```
