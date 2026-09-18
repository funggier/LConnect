# รูปแบบสิทธิ์ของ LConnect

## Default: Full-machine access

LConnect ถูกออกแบบให้ค่าเริ่มต้นเข้าถึงเครื่องได้กว้าง เพื่อใช้พัฒนา ทดสอบ และดูแลระบบจาก ChatGPT โดยไม่ต้องเพิ่ม directory ทีละที่

ค่าเริ่มต้น:

```json
{
  "fullMachineAccess": true
}
```

## ความหมายของ Full-machine access

Filesystem tools สามารถ resolve path ไปยังไดรฟ์และ directory ใดก็ได้

อย่างไรก็ตาม "ทั้งเครื่อง" ในที่นี้หมายถึง:

> ทุกตำแหน่งและการกระทำที่ Windows account ซึ่งรัน LConnect มีสิทธิ์ทำได้

LConnect ไม่ยกระดับสิทธิ์ Windows เอง

ถ้า process ไม่ได้รันเป็น Administrator ก็ยังถูก Windows ปฏิเสธตำแหน่ง/คำสั่งที่ต้องการสิทธิ์สูงกว่า

## Shell และ Process

`powershell_run`, `command_run`, `start_process`, `kill_process` ทำงานด้วยสิทธิ์ Windows account เดียวกัน

ดังนั้น shell สามารถเข้าถึง path นอก workspace ได้โดย design

## Restricted mode

ถ้าต้องการจำกัด filesystem:

```json
{
  "fullMachineAccess": false,
  "allowedDirectories": [
    "C:\\Projects"
  ]
}
```

เมื่อปิด full-machine access filesystem tools จะตรวจ path กับ `allowedDirectories`

## ถ้าต้องการจำกัดทั้ง filesystem และ execution

ต้องปิด shell/process ด้วย:

```json
{
  "fullMachineAccess": false,
  "allowedDirectories": [
    "C:\\Projects"
  ],
  "shell": {
    "enabled": false
  }
}
```

หรือ start ด้วย:

```powershell
.\Start-LConnect.ps1 -DisableExecution
```

สำคัญ: การจำกัด `allowedDirectories` อย่างเดียว **ไม่ได้ sandbox arbitrary PowerShell**

ถ้า shell ยังเปิดอยู่ PowerShell สามารถทำสิ่งที่ Windows account มีสิทธิ์ทำได้

## Environment overrides

สามารถ override full-machine access ผ่าน:

```text
LCONNECT_FULL_MACHINE_ACCESS
```

ค่า `false`, `0`, `no`, `off` จะปิด full-machine access

สามารถเพิ่ม allowed directories ผ่าน:

```text
LCONNECT_ALLOWED_DIRECTORIES
```

โดยใช้ path delimiter ของระบบ

## แนวทางของโปรเจกต์

LConnect ไม่ได้ตั้งเป้าเป็น security sandbox

เป้าหมายหลักคือ local machine control ที่ใช้งานได้จริงและขยายได้แบบ modular

ถ้าต้องการ isolation ที่แข็งจริง ควรใช้ boundary ของระบบปฏิบัติการ เช่น:

- Windows account แยก
- VM
- container/sandbox ที่เหมาะสม
