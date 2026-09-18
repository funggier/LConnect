# การติดตั้ง LConnect

เอกสารนี้อธิบายการติดตั้ง LConnect บน Windows

## 1. สิ่งที่ต้องมี

- Windows 10/11
- Node.js และ npm
- Git
- สิทธิ์ใช้งาน OpenAI Tunnel
- Tunnel ที่ผู้ใช้สร้างและตั้งค่าเอง
- Runtime API key ที่มีสิทธิ์ใช้งาน tunnel เป้าหมาย

LConnect ไม่สร้าง Tunnel ให้และไม่เก็บ Tunnel ID ไว้ใน repository

## 2. Clone

```powershell
git clone https://github.com/funggier/LConnect.git
cd LConnect
```

## 3. ติดตั้ง dependency

ดับเบิลคลิก:

```text
Install-LConnect.cmd
```

หรือ:

```powershell
.\Install-LConnect.ps1
```

Installer จะ:

- รัน `npm install --omit=dev`
- ดาวน์โหลด official `tunnel-client.exe` รุ่นล่าสุดสำหรับ Windows จาก OpenAI GitHub Releases
- สร้างโฟลเดอร์ `runtime/` และ `logs/`

Installer จะ **ไม่**:

- สร้าง Tunnel
- ถาม Tunnel ID
- สร้าง `mcp-conf.yaml`
- บันทึก API key
- แก้ Tunnel configuration ของผู้ใช้

## 4. ตั้งค่า Tunnel ด้วยตัวเอง

ใช้ OpenAI tunnel-client documentation เป็น source of truth:

- https://github.com/openai/tunnel-client/blob/master/docs/connectors.md
- https://github.com/openai/tunnel-client/blob/master/docs/configuration.md

ค่าที่เกี่ยวข้องกับองค์กรและ tunnel ต้องสร้าง/ดูแลเองบนเครื่อง local

สำหรับ LConnect สิ่งสำคัญคือ MCP binding ของ `main` channel ต้องเรียก:

```text
node "lconnect-mcp.mjs"
```

เก็บ tunnel profile local ไว้ที่:

```text
mcp-conf.yaml
```

หรือปรับ launcher ให้ใช้ profile local อื่นของคุณเอง

`mcp-conf.yaml` ถูกใส่ใน `.gitignore` จึงไม่ควรถูก push เข้า GitHub

## 5. OpenAI settings ที่เกี่ยวข้อง

Tunnel management:

```text
https://platform.openai.com/settings/organization/tunnels
```

Runtime API keys:

```text
https://platform.openai.com/settings/organization/api-keys
```

ChatGPT Connector settings:

```text
https://chatgpt.com/#settings/Connectors
```

## 6. Start

เมื่อ local tunnel profile พร้อมแล้ว:

```text
Start-LConnect.cmd
```

หรือ:

```powershell
.\Start-LConnect.ps1
```

โปรแกรมจะถาม:

- OpenAI Runtime API key
- Organization ID

Runtime API key ถูกใส่เป็น environment variable เฉพาะ lifetime ของ launcher และไม่ได้เขียนลง repo

## 7. ตรวจสถานะ

```text
Status-LConnect.cmd
```

Status รุ่นปัจจุบันแยกตรวจหลายระดับ:

- tunnel-client process ยังทำงานหรือไม่
- `/healthz` liveness
- `/readyz` startup readiness
- control-plane poll health
- MCP observed state ผ่าน `/health/mcp`
- dispatcher / response-delivery / control-plane component state เมื่อ runtime รองรับ

สำคัญ: `/readyz = 200 ready` เพียงอย่างเดียวไม่ได้ยืนยันว่า stdio MCP child ยังตอบ RPC ได้จริง

LConnect ต้องใช้ tunnel-client `0.0.14` หรือใหม่กว่า

ถ้าเป็น installation เก่า ให้:

```text
Stop-LConnect.cmd
Update-TunnelClient.cmd
Start-LConnect.cmd
```

Updater ไม่สร้างหรือแก้ Tunnel ID, `mcp-conf.yaml`, Runtime API key หรือ tunnel profile ใด ๆ

## 8. เชื่อม ChatGPT

เปิด ChatGPT Connector settings แล้วเลือก Connection แบบ Tunnel จากนั้นเลือก tunnel ที่คุณตั้งค่าไว้เอง

หลังเปลี่ยน tool catalog หรือเพิ่ม module ควร refresh connector/plugin เพื่อให้ ChatGPT discover tools ใหม่

## 9. ทดสอบ LConnect Core

```powershell
npm run check
npm test
```

`npm run check` ตรวจ syntax ของ Core/modules/tests

`npm test` เปิด child MCP server จริงและทดสอบ:

- MCP initialize
- tools/list
- filesystem
- full-machine filesystem access
- system_info
- npm.cmd execution
- listening ports
- process lifecycle

## 10. Stop

```text
Stop-LConnect.cmd
```

หรือ:

```powershell
.\Stop-LConnect.ps1
```
