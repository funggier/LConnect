# LCN-019 — Window Control Completion Report

Date: **2026-10-02 (+07)**

Result: **COMPLETE / DEPLOYED / LIVE GREEN**

## Scope delivered

Added eight native Windows Window Control MCP tools:

- `list_windows`
- `get_window`
- `focus_window`
- `move_window`
- `resize_window`
- `minimize_window`
- `maximize_window`
- `close_window`

Implementation uses Win32 `user32.dll` through PowerShell P/Invoke and adds no npm dependency.

## Identity and safety model

- primary identity: `HWND + PID`
- HWND is returned as a string (`0x...`) so 64-bit handles never pass through JavaScript number precision
- mutating tools accept optional `expected_pid`
- an HWND/PID mismatch is rejected as `WINDOW_IDENTITY_MISMATCH`
- title/class/process strings cross PowerShell → Node through UTF-8 Base64 to avoid console code-page corruption
- `close_window` posts `WM_CLOSE`; it does not forcibly terminate the owner process
- `focus_window` reports the real foreground result because Windows foreground policy may reject focus stealing
- move coordinates use the Windows virtual desktop and therefore permit negative coordinates on multi-monitor layouts

## Local evidence

Baseline:

- main/origin main: `d1ff596ecf07acd1bb9acff2e2ce925c8eeed9b3`
- worktree: clean
- runtime: LConnect 1.2.2 / 125 tools / PID 15820

Dedicated disposable Windows Forms fixture:

- `list_windows`: PASS
- `get_window` missing/exact: PASS
- HWND/PID fixture identity: PASS
- expected PID mismatch rejection: PASS
- move: PASS
- resize: PASS
- minimize: PASS
- maximize: PASS
- focus contract + foreground evidence: PASS
- WM_CLOSE: PASS
- closed HWND no longer found: PASS

Full qualification:

- `npm run check`: PASS
- full `npm test`: PASS / exit 0
- test catalog: **133 tools**
- `npm audit --audit-level=high`: PASS / 0 vulnerabilities
- `git diff --check`: PASS

## Exact-commit CI

Implementation commit:

`b11e4240daf7054412b32e10c7a6fb0df7330914`

GitHub CI:

- run: `36980540818`
- run number: **#153**
- workflow: LConnect CI
- exact head SHA: implementation commit above
- result: **SUCCESS**
- Windows runtime smoke tests: PASS
- dependency audit: PASS

## Deployment evidence

Installed root:

`T:\Sanbox\openclawspace\tunnel-mcp-ok`

Source root:

`T:\Sanbox\openclawspace\LConnect-github`

Implementation deployment:

- tracked parity: **218/218 exact**
- missing: 0
- changed: 0
- source/install manifest digest:
  `b6f5de9f28418f257699b550dce7d55c37990aa28bfed894765d46814ab76157`
- preserved paths: **6/6 present**

Preserved local paths:

- `mcp-conf.yaml`
- `node_modules/`
- `logs/`
- `runtime/`
- `tunnel-client.exe`
- `local-secrets/`

Encrypted credential SHA-256 before and after deployment/restart:

`b773cace3931586913b84460c4b00cbd1ce33b78a165fa77355e259470cf2665`

## Live runtime evidence

Self-restart completed successfully.

New runtime:

- version: `1.2.2`
- PID: `1264`
- tool count: **133**
- catalog digest:
  `c9e09c413dfaab80b2885fb6b43006bdfe7ac8fc2fee1446f3310480d8a19b89`
- runtime root:
  `T:\Sanbox\openclawspace\tunnel-mcp-ok`

Runtime catalog contains all 8 Window Control tool names.

Installed post-restart Window Control smoke:

- disposable GUI fixture: PASS
- move/resize/minimize/maximize/focus/close: PASS
- no user application window was used as the mutation target

## Release integrity

The existing `v1.2.2` tag/release was not moved, recreated, or overwritten.

## Next task

**LCN-020 — Keyboard / Mouse**

Verify live GitHub/runtime state before activation. Keep LCN-020 deferred until implementation actually starts.
