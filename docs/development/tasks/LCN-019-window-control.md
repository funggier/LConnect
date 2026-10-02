# LCN-019 — Window Control

Status: **COMPLETE**

## Goal

Control native top-level Windows windows through stable `HWND + PID` identity rather than pixel coordinates.

## Planned capabilities

- `list_windows`
- `get_window`
- `focus_window`
- `move_window`
- `resize_window`
- `minimize_window`
- `maximize_window`
- `close_window`

## Design notes

- native Win32 `user32.dll` through PowerShell P/Invoke
- `HWND + PID` identity and optional `expected_pid` mutation guard
- title/class/process/visibility/minimized/maximized/rectangle evidence
- screen coordinates are virtual-desktop coordinates and can be negative on multi-monitor layouts
- bounded enumeration/filtering
- mutation returns before/after evidence
- `focus_window` reports actual foreground result because Windows foreground-stealing policy can reject focus
- `close_window` posts `WM_CLOSE` rather than terminating the owning process

## Local qualification evidence

- live baseline before implementation: main/origin main `d1ff596ecf07acd1bb9acff2e2ce925c8eeed9b3`, clean worktree
- runtime before deployment: LConnect 1.2.2 / 125 tools / PID 15820
- dedicated disposable Windows Forms fixture: PASS
- `list_windows`: PASS
- `get_window` exact/missing: PASS
- HWND + PID identity correlation: PASS
- `expected_pid` mismatch guard: PASS
- `move_window`: PASS
- `resize_window`: PASS
- `minimize_window`: PASS
- `maximize_window`: PASS
- `focus_window`: PASS; actual foreground result reported
- `close_window`: PASS using `WM_CLOSE`; closed HWND no longer found
- full `npm test`: PASS / exit 0; test catalog = 133 tools
- `npm run check`: PASS
- `npm audit --audit-level=high`: PASS / 0 vulnerabilities
- `git diff --check`: PASS

## Final qualification evidence

- implementation commit: `b11e4240daf7054412b32e10c7a6fb0df7330914`
- exact implementation CI: #153 / run `36980540818` — **PASS**
- Windows CI disposable GUI fixture: PASS
- full local regression: PASS
- deployed tracked parity before closure docs: **218/218 exact**
- source/install manifest digest: `b6f5de9f28418f257699b550dce7d55c37990aa28bfed894765d46814ab76157`
- preserved local paths: 6/6 present
- encrypted credential SHA-256 before/after deployment/restart: `b773cace3931586913b84460c4b00cbd1ce33b78a165fa77355e259470cf2665`
- live runtime after restart: LConnect `1.2.2`, PID `1264`, **133 tools**
- live runtime catalog digest: `c9e09c413dfaab80b2885fb6b43006bdfe7ac8fc2fee1446f3310480d8a19b89`
- installed Window Control smoke after restart: PASS
- live runtime catalog contains all 8 Window Control tools

Result: **COMPLETE / DEPLOYED / LIVE GREEN**.

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