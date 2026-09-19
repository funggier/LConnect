# ACTIVE — LConnect Development

Last updated: 2026-09-19

## Current baseline

- Repository: `funggier/LConnect`
- Branch: `main`
- Current development baseline when this coordination set was created: `7ff74f486b754578662bb821518df5f660a2883f`
- Latest released baseline at that point: `v1.0.2 — Basic Recovery`
- Platform validated: Windows 10 x64 / Node.js 24 / Windows PowerShell 5.1
- OpenAI tunnel-client minimum: `0.0.14`
- MCP topology: one `main` channel, modular Core

> Before modifying source, always verify the live GitHub/local HEAD. Do not assume the SHA above is still current.

## Active task

### LCN-007 — Environment Module

Status: **ACTIVE**

Task: [tasks/LCN-007-environment-module.md](tasks/LCN-007-environment-module.md)

Purpose:

สร้าง structured environment tools เป็น module ใหม่ตัวแรกของ expansion roadmap เพื่อให้ AI ตรวจ environment/PATH/executable resolution ได้โดยไม่ต้องพึ่ง raw PowerShell ทุกครั้ง

Planned first tools:

- `env_get`
- `env_list`
- `env_set`
- `path_list`
- `which`

## Why this task is first

Environment module:

- implementation risk ต่ำ
- dependency ต่ำ
- ใช้เป็นฐานให้ Development, Git, Services, Browser และ tool discovery อื่น
- ช่วยวินิจฉัย PATH/provider/runtime problems ที่เจอบ่อย
- เป็น task ที่เหมาะใช้พิสูจน์ module conventions สำหรับชุด expansion ใหม่

## Immediate next steps

1. Verify current `main` and CI status.
2. Read `DECISIONS.md`.
3. Define exact schemas and mutation semantics.
4. Add `modules/environment.mjs`.
5. Register tools in Core.
6. Add tests.
7. Update `docs/TOOLS_TH.md`.
8. Run `npm run check`, `npm test`, audit.
9. Push and use GitHub CI as acceptance gate.
10. Update this coordination state.

## Do not start in parallel yet

ยังไม่ควรเริ่ม Desktop/Browser modules ก่อน System/Development foundation อย่างน้อยชุดแรกผ่าน เพราะ Window/Input/Browser มี dependency และ failure modes ซับซ้อนกว่า
