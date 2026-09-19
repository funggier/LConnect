# LCN-011 — Hardware

Status: **READY**

## Goal

ให้ agent ใช้ resource/hardware evidence ตัดสิน workload และวิเคราะห์ bottleneck

## Planned capabilities

cpu_info, memory_info, disk_info, gpu_info, storage_health, battery_info

## Design notes

unsupported sensors ต้องคืน unavailable ไม่เดาค่า

## Acceptance criteria

- capability ถูก register ผ่าน MCP และมี structured schema
- output bounded และ error preserve root cause
- tests ครอบคลุม happy path + failure path ที่สำคัญ
- existing tools ไม่ regression
- documentation อัปเดต
- npm check/test/audit และ GitHub CI PASS
- บันทึก exact commit SHA, changed files, runtime evidence และ follow-up tasks ตอนปิดงาน

## Scope rule

ถ้าพบ adjacent work ที่แยกได้ ให้สร้าง numbered task ใหม่แทนการขยาย task นี้ไม่สิ้นสุด