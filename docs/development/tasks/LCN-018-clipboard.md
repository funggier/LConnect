# LCN-018 — Clipboard

Status: **COMPLETE**

## Goal

Add deterministic text clipboard control to LConnect as the first resumed Desktop Control capability after the v1.2.2 baseline.

## Planned MCP tools

- `clipboard_get`
- `clipboard_set`
- `clipboard_clear`

## Scope

- Windows text clipboard only
- Unicode-safe roundtrip, including Thai text
- distinguish `text`, `empty`, and `non_text` state
- structured JSON results
- bounded returned text
- explicit platform/API/failure semantics
- minimal dependencies
- preserve the user's clipboard during live/local acceptance where practical

## Implementation decision

Use the native Windows clipboard API through a short PowerShell STA process. This keeps the Node dependency surface unchanged while satisfying the STA requirement of `System.Windows.Forms.Clipboard` and allowing inspection of text/non-text state.

## Acceptance gates

1. `clipboard_get` reports state without guessing non-text data as text.
2. `clipboard_set` performs exact Unicode/Thai set → get roundtrip.
3. `clipboard_clear` produces an explicit empty state.
4. oversize reads are bounded and reported as truncated rather than silently unbounded.
5. local smoke tests preserve/restore the prior clipboard value where possible.
6. `npm run check`, full `npm test`, dependency audit and `git diff --check` pass locally.
7. exact implementation commit CI passes on GitHub.
8. deployed source↔installed parity passes while local-only paths remain preserved.
9. restarted runtime exposes the new tools and live clipboard acceptance passes.
10. only after these gates are satisfied may LCN-018 be marked COMPLETE.

## Local qualification evidence

- live baseline before edits: main/origin main `4993e23812e3e4a734b4cc0fbea3e18eaca4791a`, clean worktree
- live runtime before deploy: LConnect 1.2.2 / 122 tools / PID 2640
- `npm run check`: PASS
- direct local `clipboard_get`: PASS, correctly reported current user clipboard as `non_text`
- destructive local mutation: intentionally skipped because the pre-existing clipboard was non-text and cannot be restored by the text-only LCN-018 scope
- full `npm test`: PASS / exit 0; test catalog = 125 tools
- `npm audit --audit-level=high`: PASS / 0 vulnerabilities
- `git diff --check`: PASS
- Windows CI is required to exercise disposable Unicode set → get, bounded read, clear, and empty-state mutation coverage without risking the user's clipboard.

## Final qualification evidence

- implementation commit: `0e36523b0bfa44d225a20dd3508ffae2b920735c`
- first exact-commit CI: #150 / run `36976782532` — FAIL at Windows Unicode roundtrip
- diagnosed root cause: Windows PowerShell 5.1 stdout code-page transport corrupted non-ASCII clipboard text between worker and Node
- fix commit: `1123ec5efee8053ea298cc178a6cff068b25ac34`
- fix: clipboard text crosses the PowerShell/Node boundary as UTF-8 Base64, avoiding console code-page dependence
- exact fix-commit CI: #151 / run `36976946009` — **PASS**
- CI disposable clipboard mutation coverage: Unicode/Thai set→get exact, bounded read/truncation, clear, empty-state, prior-state restore
- deployed tracked parity: **215/215 exact**
- source/install manifest digest: `3a406509029c5a4b368b5440e3be4d01c40eaf8bf7c771f610d37f306af21375`
- preserved local paths: 6/6 present
- encrypted credential SHA-256 before/after deployment/restart: `b773cace3931586913b84460c4b00cbd1ce33b78a165fa77355e259470cf2665`
- live runtime after restart: LConnect `1.2.2`, PID `15820`, **125 tools**
- live runtime catalog digest: `254011dfa1f0a018eed2c754fd79f3932394b5c9988fdf3483b858954b1d57bb`
- runtime catalog contains `clipboard_get`, `clipboard_set`, `clipboard_clear`
- installed smoke after restart: PASS; current user clipboard correctly reported `non_text` and was not destructively replaced

Result: **COMPLETE / DEPLOYED / LIVE GREEN**.

## Constraints

- Do not reset the worktree.
- Do not move, recreate, overwrite, or otherwise alter the existing `v1.2.2` tag/release.
- Do not commit clipboard contents or local secrets.
