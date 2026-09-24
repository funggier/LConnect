# แนวทางพัฒนา LConnect

> สำหรับสถานะงานปัจจุบัน roadmap, numbered tasks, decisions และ session handoff ให้เริ่มที่ [development/README.md](development/README.md)

## หลักการ

LConnect ใช้ modular architecture

กฎหลัก:

> เพิ่ม capability เป็น module และ register เข้า Core เดิม แทนการเพิ่ม tunnel channel ใหม่โดยไม่มีเหตุผลด้าน transport

## โครงสร้าง

```text
lconnect-mcp.mjs
modules/
  config.mjs
  runtime.mjs
  filesystem.mjs
  shell.mjs
  process.mjs
  system.mjs
tests/
  smoke.mjs
  execution-smoke.mjs
```

## สร้าง module ใหม่

ตัวอย่าง:

```js
export function registerExampleTools(server, config) {
  server.tool(
    "example_tool",
    "Description",
    {},
    async () => ({
      content: [{ type: "text", text: "ok" }]
    })
  );
}
```

จากนั้น import ใน `lconnect-mcp.mjs` และ register:

```js
import { registerExampleTools } from "./modules/example.mjs";

registerExampleTools(server, config);
```

## Naming

ชื่อ tool ควร:

- สั้น
- อธิบาย action ชัด
- ไม่ผูกกับ version
- ไม่ใช้ชื่อที่ทำให้ meaning เปลี่ยนเมื่อระบบโตขึ้น

ตัวอย่าง:

```text
system_info
start_process
read_process_output
list_listening_ports
```

## Shared runtime

ถ้า module ต้อง spawn process ควรใช้ helper ใน `modules/runtime.mjs` ก่อนสร้าง implementation ซ้ำ

สิ่งที่ runtime layer จัดการ:

- spawn
- stdout/stderr
- timeout
- output cap
- PowerShell

## Error behavior

tool ที่ล้มควรคืน:

```js
{
  content: [{ type: "text", text: "..." }],
  isError: true
}
```

ข้อความ error ต้องช่วย debug ได้ ไม่ควรซ่อน root cause โดยไม่จำเป็น

## Test

ก่อน commit:

```powershell
npm run check
npm test
```

### smoke.mjs

ตรวจ:

- MCP initialize
- tools/list
- required tools
- access scope
- system_info
- full-machine filesystem access

### execution-smoke.mjs

ตรวจ:

- `command_run` กับ `npm.cmd`
- listening ports
- start process
- kill process tree
- read process status

## เมื่อเพิ่ม tool ใหม่

1. เพิ่ม implementation
2. เพิ่มชื่อใน required tools ของ smoke test
3. เพิ่ม test behavior ถ้ามี side effect/runtime dependency
4. อัปเดต `docs/TOOLS_TH.md`
5. `npm run check`
6. `npm test`
7. ถ้าเป็น deployment/release ให้ใช้ `deployment_verification_snapshot` ตรวจ source↔installed/package/dependency/preserved/runtime evidence
8. restart LConnect เมื่อ source ที่ installed เปลี่ยน
9. refresh ChatGPT connector/plugin ถ้า schema เปลี่ยน

## Tunnel configuration

ห้าม commit:

- Tunnel ID
- runtime profile จริง
- API key
- organization-specific secret/config

ไฟล์ `mcp-conf.yaml` อยู่ใน `.gitignore`

LConnect source กับ Tunnel ownership ต้องแยกจากกัน

## Roadmap และ Task Tracking

Roadmap expansion รุ่นปัจจุบันอยู่ที่:

- [development/ROADMAP.md](development/ROADMAP.md)
- [development/ACTIVE.md](development/ACTIVE.md)
- [development/STATUS.md](development/STATUS.md)
- [development/TASK_INDEX.md](development/TASK_INDEX.md)

ลำดับที่ทำเสร็จแล้วคือ System Foundation → Developer Foundation → Observation → Agent Operations Reliability → Delivery/Turn Reliability → Execution Ergonomics

Agent Operations Reliability plan:

- [development/AGENT_OPERATIONS_RELIABILITY_PLAN.md](development/AGENT_OPERATIONS_RELIABILITY_PLAN.md)
- LCN-025–030 complete แล้ว
- Reliability/diagnostic follow-up LCN-031–039 complete ที่ evidence boundary ปัจจุบัน
- Execution Ergonomics LCN-040–044 complete at current need โดยเพิ่มเฉพาะ deterministic primitives ที่เกิดจาก pain point จริง เช่น structured data/directory inspection, Git/GitHub exact verification และ deployment verification

Desktop Control (LCN-018–020) และ Browser Automation (LCN-021–023) ยัง **DEFERRED** จนมีการเปิด scope ใหม่โดยชัดเจน

Browser direction:

- Firefox เป็น primary backend
- Chrome เป็น secondary backend
- Edge ไม่ใช่ dependency ของ phase แรก

การเพิ่ม GUI/control module ต้องรักษา Core contract และ `main` MCP topology เดิมไว้
