# LCN-002 — Full-machine Access Default

Status: **COMPLETE**

## Goal
ให้ filesystem access ค่าเริ่มต้นครอบคลุมทุก path ที่ Windows account ของ LConnect มีสิทธิ์เข้าถึง

## Why
LConnect มีเป้าหมายเป็น local development/administration layer ไม่ใช่ strict sandbox การจำกัด workspace เป็น default ทำให้ workflow ต้องแก้ config ซ้ำและขัดกับ use case หลัก

## Result
- `fullMachineAccess: true` เป็น default แม้ config ไม่มีค่า
- restricted mode ยังคงมีเป็น opt-in
- shell/process ทำงานตามสิทธิ์ของ Windows account เดียวกัน

## Evidence
- Full-machine filesystem smoke test: PASS
- Access model documented
- Restricted example config retained

## Historical note
Task ปิดแล้ว ถ้ามี requirement ด้าน access ใหม่ให้เปิด task ใหม่แทนการเปลี่ยนความหมายของ task นี้
