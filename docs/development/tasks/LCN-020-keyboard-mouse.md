# LCN-020 — Keyboard / Mouse

Status: **ACTIVE**

## Goal

Provide a guarded native keyboard/mouse fallback layer for Windows UI control without making coordinate input the primary browser DOM strategy.

## Planned capabilities

- `key_press`
- `key_combo`
- `type_text`
- `mouse_move`
- `mouse_click`
- `mouse_scroll`

## Design notes

- Win32 `SendInput` through PowerShell P/Invoke; no new npm dependency
- keyboard tools require target `hwnd`; optional `expected_pid` protects against HWND reuse
- keyboard injection proceeds only when the target can be confirmed as foreground
- `type_text` uses Unicode input events instead of keyboard-layout-dependent key synthesis
- mouse coordinates use virtual-desktop screen coordinates
- click/scroll can enforce `expected_hwnd` at the target point before injecting input
- responses report input count, target/point evidence, and cursor before/after where relevant
- this remains a fallback/control layer, not the browser DOM strategy

## Local qualification evidence

- live baseline before implementation: main/origin main `ad17b90c48305acbc4ffde7ed74e910e78431221`, clean worktree
- runtime before deployment: LConnect 1.2.2 / 133 tools / PID 1264
- dedicated disposable Windows Forms input fixture: PASS
- keyboard `expected_pid` guard: PASS
- Unicode/Thai `type_text`: PASS
- `key_combo` + `key_press`: PASS
- mouse point/window guard: PASS
- `mouse_move`: PASS
- `mouse_click`: PASS
- `mouse_scroll`: PASS
- cursor restored after fixture test
- full `npm test`: PASS / exit 0; test catalog = 139 tools
- `npm run check`: PASS
- `npm audit --audit-level=high`: PASS / 0 vulnerabilities
- `git diff --check`: PASS
- full-suite focus race found and repaired without weakening fail-closed foreground targeting: temporary `AttachThreadInput` is used only to acquire/verify the requested HWND, then detached before input continues

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