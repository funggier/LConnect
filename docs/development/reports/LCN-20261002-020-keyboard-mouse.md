# LCN-020 — Keyboard / Mouse Completion Report

Date: **2026-10-02 (+07)**

Result: **COMPLETE / DEPLOYED / LIVE GREEN**

## Scope delivered

Added six native Windows input MCP tools:

- `key_press`
- `key_combo`
- `type_text`
- `mouse_move`
- `mouse_click`
- `mouse_scroll`

Implementation uses Win32 `SendInput` / cursor APIs through PowerShell P/Invoke and adds no npm dependency.

## Safety and targeting model

Keyboard:

- keyboard tools require a target `hwnd`
- optional `expected_pid` protects against HWND reuse
- input is sent only after the target HWND is verified as the actual foreground window
- foreground acquisition may temporarily use `AttachThreadInput`; threads are detached before input continues
- if foreground cannot be verified, the operation fails closed with `FOREGROUND_NOT_ACQUIRED`
- `type_text` uses `KEYEVENTF_UNICODE`, not keyboard-layout-dependent character synthesis

Mouse:

- coordinates use the Windows virtual desktop and may be negative
- click/scroll optionally accept `expected_hwnd`
- the root window at the point is verified before injection when `expected_hwnd` is supplied
- mismatches fail closed with `POINT_WINDOW_MISMATCH`
- responses include point/cursor/window evidence

This layer remains a native UI fallback/control mechanism; it is not the primary browser DOM strategy.

## Local evidence

Baseline:

- main/origin main: `ad17b90c48305acbc4ffde7ed74e910e78431221`
- worktree: clean
- runtime: LConnect 1.2.2 / 133 tools / PID 1264

Dedicated disposable Windows Forms input fixture:

- keyboard expected PID guard: PASS
- Unicode/Thai `type_text`: PASS
- `key_combo` + `key_press`: PASS
- mouse point/window guard: PASS
- `mouse_move`: PASS
- `mouse_click`: PASS
- `mouse_scroll`: PASS
- cursor restored after fixture test

During the first full-suite run a focus race was observed after the prior Window Control fixture. The keyboard guard correctly refused to type into the wrong foreground window. The repair strengthened foreground acquisition with temporary Win32 `AttachThreadInput` while preserving the fail-closed postcondition. The dedicated fixture and full regression then passed.

Full qualification:

- `npm run check`: PASS
- full `npm test`: PASS / exit 0
- test catalog: **139 tools**
- `npm audit --audit-level=high`: PASS / 0 vulnerabilities
- `git diff --check`: PASS

## Exact-commit CI

Implementation commit:

`7da92f4fc17968701991032d33b6dc7baf841a0e`

GitHub CI:

- run: `36982304370`
- run number: **#155**
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

- tracked parity: **221/221 exact**
- missing: 0
- changed: 0
- source/install manifest digest:
  `af661603ff1d215d63f1e89571ef132dd8897bc9ec0885e4d72faf77fafa1e2d`
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
- PID: `18436`
- tool count: **139**
- catalog digest:
  `e22b20d161942ff699048c5ede0c56baabf5e27b128bb0edaf3bab61b0819802`
- runtime root:
  `T:\Sanbox\openclawspace\tunnel-mcp-ok`

Runtime catalog contains all six new Keyboard / Mouse tool names.

Installed post-restart input smoke:

- disposable GUI fixture: PASS
- Unicode/Thai keyboard input: PASS
- key combo/press: PASS
- mouse move/click/scroll: PASS
- no user application window was used as the mutation target

## Release integrity

The existing `v1.2.2` tag/release was not moved, recreated, or overwritten.

## Next task

**LCN-021 — Browser Common Layer**

Verify live GitHub/runtime state before activation. Keep LCN-021 deferred until implementation actually starts.
