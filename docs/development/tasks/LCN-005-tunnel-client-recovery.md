# LCN-005 — tunnel-client Recovery and v1.0.1

Status: **COMPLETE**

## Goal

แก้ timeout recovery ด้วย minimum tunnel-client version gate และ updater

## Why

Root cause อยู่ใน shared stdio recovery ของ tunnel-client รุ่นเก่า

## Result / Evidence

ขั้นต่ำ 0.0.14; updater ไม่แตะ tunnel config; release v1.0.1; commit eba83226e065e3e5c02442a216d28c137b9315a8

## Historical note

Task ปิดแล้ว ถ้ามี requirement ใหม่ให้เปิด numbered task ใหม่เพื่อรักษาประวัติเดิม