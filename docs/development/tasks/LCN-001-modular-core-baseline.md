# LCN-001 — Modular MCP Core Baseline

Status: **COMPLETE**

## Goal

สร้าง LConnect Core แบบ modular และ expose filesystem, shell, process/session และ system tools ผ่าน MCP `main` channel เดียว

## Why

เดิม tunnel แยก filesystem กับ PowerShell คนละ channel ทำให้ ChatGPT tool discovery ไม่รวม capability ทั้งหมด การรวม Core เดียวทำให้ catalog เสถียรและขยาย module ต่อได้

## Scope / Result

- Core: `lconnect-mcp.mjs`
- Modules: config/runtime/filesystem/shell/process/system
- MCP discovery: 25 tools
- Smoke tests: initialize + tools/list + core capability checks

## Acceptance / Evidence

- Local runtime acceptance: PASS
- 25 tools discovered after connector refresh
- process lifecycle/stdin/kill tested
- This baseline became the foundation of v1.0.0

## Historical note

This task is closed. Reopen only if new evidence invalidates the acceptance result; otherwise create a new task for follow-up work.
