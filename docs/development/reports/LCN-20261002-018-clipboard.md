# LCN-018 — Clipboard Completion Report

Date: **2026-10-02 (+07)**

Result: **COMPLETE / DEPLOYED / LIVE GREEN**

## Scope delivered

Added three Windows text clipboard MCP tools:

- `clipboard_get`
- `clipboard_set`
- `clipboard_clear`

Implementation uses a short Windows PowerShell STA worker around `System.Windows.Forms.Clipboard`, with no new npm dependency.

## Behavior

- explicit `text`, `empty`, and `non_text` states
- Unicode-safe set/get
- Thai text covered in CI
- bounded reads with `max_chars`, `original_chars`, and `truncated`
- exact readback verification after set
- clear verification
- bounded retry for transient Windows clipboard contention
- non-Windows calls return an explicit unsupported error

Clipboard text crosses the Windows PowerShell 5.1 → Node boundary as UTF-8 Base64 so console code pages cannot corrupt non-ASCII text.

## Local evidence

Baseline before implementation:

- main/origin main: `4993e23812e3e4a734b4cc0fbea3e18eaca4791a`
- worktree: clean
- runtime: LConnect 1.2.2 / 122 tools / PID 2640

Validation:

- `npm run check`: PASS
- full `npm test`: PASS / exit 0
- `npm audit --audit-level=high`: PASS / 0 vulnerabilities
- `git diff --check`: PASS
- local `clipboard_get`: PASS, current user clipboard reported `non_text`
- local destructive mutation intentionally skipped because LCN-018 is text-only and the pre-existing non-text clipboard could not be faithfully restored

## Exact-commit CI

Initial implementation commit:

`0e36523b0bfa44d225a20dd3508ffae2b920735c`

CI #150 / run `36976782532`: **FAIL**

Failure:

- disposable Windows runner began with empty clipboard
- set succeeded
- Unicode/Thai set→get comparison failed

Root cause:

- Windows PowerShell 5.1 stdout code-page transport was not a safe Unicode transport for returning clipboard text to Node

Repair commit:

`1123ec5efee8053ea298cc178a6cff068b25ac34`

Repair:

- return clipboard text from PowerShell as UTF-8 Base64
- decode in Node before applying bounds/result schema

CI #151 / run `36976946009`: **PASS**

CI covered disposable mutation safely:

- Unicode/Thai set → get exact
- bounded read/truncation
- clear
- empty state
- prior state restoration
- full regression suite
- dependency audit

## Deployment evidence

Installed root:

`T:\Sanbox\openclawspace\tunnel-mcp-ok`

Source root:

`T:\Sanbox\openclawspace\LConnect-github`

Pre-restart deployment snapshot:

- tracked parity: **215/215 exact**
- missing: 0
- changed: 0
- preserved paths: **6/6 present**
- source/install manifest digest:
  `3a406509029c5a4b368b5440e3be4d01c40eaf8bf7c771f610d37f306af21375`

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
- PID: `15820`
- tool count: **125**
- catalog digest:
  `254011dfa1f0a018eed2c754fd79f3932394b5c9988fdf3483b858954b1d57bb`
- working directory:
  `T:\Sanbox\openclawspace\tunnel-mcp-ok`

Runtime catalog includes all three new tool names.

Post-restart deployment snapshot:

- `ok=true`
- tracked parity: **215/215 exact**
- expected runtime tool count 125: PASS
- preserved paths: 6/6
- installed clipboard smoke: PASS
- current user clipboard remained non-text and was not overwritten

Note: the running LConnect catalog is already 125 tools. A ChatGPT connector/schema reconnect can still be required before the new tool schemas become directly callable in a conversation that began against the earlier 122-tool catalog.

## Release integrity

The existing `v1.2.2` tag/release was not moved, recreated, or overwritten.

Release tag target remains:

`fcf3d75c6314706e3258b6c5d1345b6f637ac78f`

## Next task

**LCN-019 — Window Control**

Verify live GitHub/runtime state before activation. Keep LCN-019 deferred until implementation actually starts.
