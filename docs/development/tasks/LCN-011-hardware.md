# LCN-011 — Hardware

Status: **ACTIVE**

## Goal

ให้ agent ใช้ resource/hardware evidence ตัดสิน workload และวิเคราะห์ bottleneck

## Planned capabilities

cpu_info, memory_info, disk_info, gpu_info, storage_health, battery_info

## Design notes

unsupported sensors ต้องคืน unavailable ไม่เดาค่า

## Progress

- 2026-09-19: Started from coordination HEAD `df0d239fb6779cef5cfc2371207fcd991c208597`.
- RED established: smoke catalog expected six hardware tools and failed because implementation was absent.
- Hardware telemetry distinguishes observed values from unsupported/unavailable values.
- Added `modules/hardware.mjs` and `tests/hardware-smoke.mjs`.
- Read-only implementation only; no hardware mutation/control.
- CPU/Memory/Disk local acceptance: PASS.
- GPU local acceptance: PASS (`available=true`).
- Storage health local acceptance: PASS using `Get-PhysicalDisk`.
- Battery local acceptance: PASS with `available=false`, `count=0` on desktop.
- Local catalog: 54 tools.
- `npm run check`: PASS.
- `npm test`: PASS.
- `npm audit --audit-level=moderate`: 0 vulnerabilities.

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