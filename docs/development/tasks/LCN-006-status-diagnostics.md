# LCN-006 — Status Diagnostics and v1.0.2

Status: **COMPLETE**

## Goal

แยก process/liveness/readiness/control-plane และ optional MCP diagnostics

## Why

0.0.14 มี recovery fix แต่ /health/mcp อาจ 404 จึงไม่ควร false-fail

## Result / Evidence

Status exit 0 บน 0.0.14; CI PASS; release v1.0.2; commit 7ff74f486b754578662bb821518df5f660a2883f

## Historical note

Task ปิดแล้ว ถ้ามี requirement ใหม่ให้เปิด numbered task ใหม่เพื่อรักษาประวัติเดิม