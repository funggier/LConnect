# LCN-018 — Clipboard

Status: **ACTIVE**

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

## Constraints

- Do not reset the worktree.
- Do not move, recreate, overwrite, or otherwise alter the existing `v1.2.2` tag/release.
- Do not commit clipboard contents or local secrets.
