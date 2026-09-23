# LCN-031 — MCP Request Timeout Containment

Status: **ACTIVE**

## Goal

ลดโอกาสที่ LConnect จะเป็นตัวทำให้ ChatGPT / OpenAI Tunnel ต้องรอ synchronous MCP response นานจนชน upstream delivery/response timeout โดยยังรักษาหลักว่า local long-running work ต้องทำต่อได้ผ่าน managed process sessions

## User-visible problem

ผู้ใช้พบอาการใน ChatGPT เช่น:

- `Connection interrupted. Waiting for the complete answer`
- `Message delivery timed out. Please try again.`

LConnect ไม่สามารถควบคุม timeout ของ ChatGPT frontend/backend ได้โดยตรง แต่ LConnect สามารถลดความเสี่ยงจากฝั่งตัวเองได้ด้วยการไม่ปล่อย synchronous MCP calls ให้ block นานเกิน budget ที่กำหนด

## Existing baseline

- tunnel-client minimum `0.0.14` แก้ historical stdio recovery failure หลัง response deadline แล้ว
- `start_process` ทำให้ OS process อยู่ต่อได้หลัง MCP call จบ
- `wait_session` / `read_process_events` / `refresh_state` มีแล้ว
- current main catalog = 96 tools

## Findings motivating this task

ก่อน LCN-031 ยังมี synchronous waits ที่ยาวกว่าที่เหมาะกับ interactive MCP transport:

- `wait_session` อนุญาตสูงสุด 30 วินาที
- shell defaults = 60 วินาที และ configured max = 600 วินาที
- Git/network/system helpers บางตัวใช้ synchronous child-process waits 20–120 วินาที
- HTTP tools อนุญาต request timeout สูงสุด 60 วินาที
- HTTP download timeout เดิมครอบเฉพาะช่วงรอ response object ไม่ได้ครอบ body consumption ทั้ง operation

## Scope

1. เพิ่ม configurable synchronous MCP request budget
2. บังคับ child-process based synchronous helpers ให้อยู่ภายใน budget เดียวกัน
3. ลด `wait_session` ให้เป็น bounded short wait และเพิ่ม exact wait evidence
4. ทำให้ HTTP timeout ครอบ request/body/download lifetime และเคารพ MCP request budget
5. ยืนยันว่า `start_process` ยังไม่ถูกตัดด้วย synchronous request budget
6. เพิ่ม regression test สำหรับ timeout containment

## Non-goals

- ไม่แก้ timeout setting ภายใน ChatGPT/OpenAI
- ไม่เพิ่ม MCP channel ใหม่; ยังคงใช้ `main` channel เดียว
- ไม่ทำ autonomous continuation / planner / ticket runtime
- ไม่เริ่ม LCN-027
- ไม่เพิ่ม Desktop/Browser capability
- ไม่แก้ tunnel-client นอกเหนือจาก minimum 0.0.14 ที่มีอยู่แล้ว

## Design invariant

```text
short synchronous MCP call
        <= request budget

long-running local work
        -> start_process
        -> session_id returned quickly
        -> process outlives request
        -> short wait/read calls inspect progress
```

A ChatGPT/UI timeout must not be treated as authority to terminate a managed local process.

## Acceptance criteria

- configurable default synchronous MCP request budget exists
- child-process synchronous helpers cannot block past that budget
- `wait_session` maximum is derived from the same budget and default wait is short
- `wait_session` reports `waited_ms` and `return_reason`
- HTTP request/download timeout applies to the complete operation
- long managed process survives a short wait timeout
- existing 96-tool catalog does not regress
- `npm run check` PASS
- `npm test` PASS on Windows CI
- dependency audit PASS
