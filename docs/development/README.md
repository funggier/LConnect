# LConnect Development Coordination

โฟลเดอร์นี้เป็นจุดอ้างอิงหลักสำหรับการพัฒนา LConnect ข้าม session

เป้าหมายคือให้ session ใหม่สามารถอ่านสถานะจาก repository แล้วตอบได้ทันทีว่า:

- ตอนนี้กำลังทำอะไร
- ทำไปแล้วอะไรบ้าง
- ทำเพราะอะไร
- หลักฐานว่าเสร็จคืออะไร
- มีข้อจำกัดหรือ decision อะไรที่ห้ามหลงทิศ
- งานถัดไปคืออะไร

## ลำดับการอ่านเมื่อเปิด session ใหม่

อ่านตามลำดับนี้:

1. [ACTIVE.md](ACTIVE.md) — งานที่ควรหยิบทำต่อทันที
2. [STATUS.md](STATUS.md) — ภาพรวมทุก workstream
3. [ROADMAP.md](ROADMAP.md) — ลำดับการพัฒนาระยะยาว
4. [DECISIONS.md](DECISIONS.md) — decision/invariant ที่อนุมัติแล้ว
5. Task file ที่ ACTIVE.md อ้างถึง
6. รายงานล่าสุดใน [reports/](reports/)
7. [AGENT_OPERATIONS_RELIABILITY_PLAN.md](AGENT_OPERATIONS_RELIABILITY_PLAN.md) — historical/completed plan ของ LCN-025–030 เมื่อจำเป็นต้องย้อนเหตุผล

ถ้าต้องการดูประวัติ ให้เปิด [TASK_INDEX.md](TASK_INDEX.md)

## กติกาการอัปเดต

เมื่อเริ่ม task:

- เปลี่ยน task เป็น `ACTIVE`
- อัปเดต `ACTIVE.md`
- ระบุ baseline commit/branch ที่ใช้จริง

ระหว่างทำ:

- บันทึก root cause / decision สำคัญลง task
- ถ้าพบ scope ใหม่ที่แยกได้ ให้สร้าง task ใหม่แทนการขยาย task เดิมไม่สิ้นสุด

เมื่อจบ:

- เปลี่ยน task เป็น `COMPLETE`, `BLOCKED` หรือ `DEFERRED`
- บันทึก commit SHA, tests, CI, release ถ้ามี
- อัปเดต `STATUS.md` และ `TASK_INDEX.md`
- ถ้ามีผลต่อ architecture ให้เพิ่ม decision ใน `DECISIONS.md`
- ถ้าเป็น checkpoint สำคัญ ให้สร้าง report ใน `reports/`

## สถานะมาตรฐาน

- `PLANNED` — มีแผนแต่ยังไม่ควรเริ่ม
- `READY` — dependency พร้อม สามารถเริ่มได้
- `ACTIVE` — กำลังทำ
- `BLOCKED` — มี blocker ที่ระบุชัด
- `COMPLETE` — acceptance ผ่านและมี evidence
- `DEFERRED` — ตั้งใจเลื่อนไปภายหลัง

## Naming

Task:

```text
LCN-001
LCN-002
...
```

ไฟล์:

```text
tasks/LCN-007-environment-module.md
```

รายงาน:

```text
reports/LCN-YYYYMMDD-<topic>.md
```

เลข task ไม่ผูกกับ version เพื่อให้ชื่อยังสมเหตุผลแม้ project โตขึ้น

## Current development boundary

- LCN-025–030 Agent Operations Reliability: COMPLETE
- LCN-031–039 Delivery / Turn Reliability: COMPLETE AT CURRENT LOCAL EVIDENCE BOUNDARY
- LCN-040–044 Execution Ergonomics: COMPLETE AT CURRENT NEED หลัง final live validation ของ LCN-044
- LCN-045: v1.2.0 Documentation and Release
- LCN-018–023 Desktop/Browser: DEFERRED

อย่าเพิ่ม Execution Ergonomics task ใหม่เพียงเพื่อขยาย catalog; สร้างเมื่อมี repeated real workflow ที่ existing deterministic tools/`batch_inspect` ยังแก้ไม่ได้อย่างเหมาะสม
