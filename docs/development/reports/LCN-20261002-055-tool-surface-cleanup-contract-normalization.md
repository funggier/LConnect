# LCN-055 — Tool Surface Cleanup & Contract Normalization

Status: **COMPLETE / DEPLOYED / LIVE GREEN**

Date: 2026-10-02 (+07)

## Result

LCN-055 normalized the 154-tool LConnect public surface without reducing capability or moving the immutable v1.2.2 release/tag.

Primary result: **PASS**

## Authority baseline

Activation authority:
- branch: `main`
- source/remote HEAD: `b96343ed4e3118ed45a24490cac89a11dc86db19`
- worktree: CLEAN
- source/install: 237/237 exact
- runtime: 1.2.2 / PID 12736 / 154 tools
- catalog digest: `2ca33225b970dd70e1350d7b4e3d9290116448181031872d643111ae7ab4c374`
- published release: immutable v1.2.2 / 122-tool baseline

## What changed

### Central tool-surface policy and metadata

Added:
- `modules/tool-surface.mjs`
- `docs/TOOL_SURFACE_POLICY.md`
- `scripts/tool-surface-audit.mjs`
- `tests/tool-surface-smoke.mjs`

The registry contains all 154 public tool names and classifies:
- 152 canonical
- 1 compatibility: `read_process_output` → `read_process_events`
- 1 deprecated: `read_file` → `read_text_file`

Each public tool has module/family/status/replacement/safety/long-running/platform metadata.

### Deterministic catalog accounting

The earlier 149-direct-registration vs 154-runtime observation was reconciled.

The five registrations missed by the simple static regex are scheduled-task mutation tools registered through the `server.tool(toolName, ...)` loop:
- `run_scheduled_task`
- `stop_scheduled_task`
- `enable_scheduled_task`
- `disable_scheduled_task`
- `delete_scheduled_task`

This was not a runtime catalog defect.

`runtime_catalog` now:
- exposes `duplicate_tool_names`
- optionally exposes tool metadata
- keeps the same 154 public tools and stable name digest

Regression tests compare the expected registry against actual MCP `tools/list`.

### Filesystem normalization

Added direct filesystem smoke coverage for:
- create/read/write/edit/move
- canonical read + compatibility alias
- multiple read
- media read
- list/list-with-sizes/tree/search/metadata
- restricted path failures
- Unicode/Thai filenames and contents
- output/media bounds

Added bounded defaults:
- text reads: `max_chars`
- multi-file reads: per-file and total char bounds
- media reads: `max_bytes`
- directory list/list-with-sizes/tree: entry bounds
- recursive search: match bound

### Test/check maintainability

Replaced long hand-maintained package.json command chains with:
- `scripts/run-checks.mjs`
- `scripts/run-tests.mjs`

The runners discover syntax/test files deterministically and retain explicit exclusion of physical Firefox/Chrome suites from ordinary CI smoke.

### Clipboard issue found during full qualification

The first full-suite attempt exposed an existing large-clipboard weakness:
- `clipboard_set` embedded base64 payload in PowerShell command arguments
- large restore could fail with Windows `spawn ENAMETOOLONG`
- clipboard worker output could also be truncated by the smaller generic shell output ceiling

Fix:
- `runProcess` gained optional stdin text support
- clipboard text payload is now passed through stdin, not command-line arguments
- clipboard worker keeps a dedicated bounded 1.5 MB JSON output ceiling
- local smoke test does not mutate a non-text or oversized user clipboard it cannot restore exactly
- added 100,000-character Thai clipboard round-trip regression

No public clipboard tool name/schema was removed.

### Documentation cleanup

Updated current-facing docs to distinguish:
- current main/runtime: 154 tools
- published v1.2.2 baseline: 122 tools

Historical reports/counts remain unchanged as audit evidence.

## Qualification

### Local

- `npm run check`: PASS, 84 JavaScript files
- targeted tool-surface smoke: PASS
- targeted filesystem smoke: PASS
- clipboard 100,000-character stdin round-trip: PASS
- full `npm test`: PASS
  - 39 Node smoke suites
  - 1 PowerShell secure-credential suite
- `npm audit --audit-level=high`: PASS, 0 vulnerabilities
- `git diff --check`: PASS
- catalog count: PASS, 154
- duplicate public names: PASS, none
- metadata completeness: PASS
- direct test-name references: 154/154

Physical managed/live browser code was not changed by LCN-055; the existing browser behavior suites passed in the full test run. No normal browser profile was used or closed.

## Implementation commit and CI

Implementation commit:

`885229e72380882aa6239996d0647a33e4148400`

Commit title:

`LCN-055 normalize tool surface and contracts`

Exact GitHub Actions:
- workflow: LConnect CI
- run: `37003411662`
- run number: #167
- head SHA: `885229e72380882aa6239996d0647a33e4148400`
- conclusion: **SUCCESS**
- Windows runtime smoke tests: SUCCESS
- dependency audit: SUCCESS

## Deployment

Deployment used Git-tracked-file copy only.

Files copied: **245**

Post-copy source/install:
- tracked parity: **245/245 exact**
- manifest digest, both sides:
  `71855d1f68650ff9099d92d275df623aea2fcef00742e90236305542c9fa1c19`
- package version: 1.2.2 == 1.2.2
- direct dependencies present: 4/4
- preserved local paths: 6/6

Preserved paths:
- `mcp-conf.yaml`
- `node_modules`
- `logs`
- `runtime`
- `tunnel-client.exe`
- `local-secrets`

Encrypted credential SHA-256 before and after deployment/restart:

`b773cace3931586913b84460c4b00cbd1ce33b78a165fa77355e259470cf2665`

## Live restart and runtime qualification

Secure detached self-restart was invoked from the installed root using the stored DPAPI credential path.

Restart log:
`logs/restart-20261002-185642.log`

Final log evidence:
`restart_complete tunnel_pid=17308 readiness=pass`

Restart worker residue: none.

New live MCP runtime:
- version: **1.2.2**
- PID: **4704**
- started: `2026-10-02T11:56:44.954Z`
- working directory: `T:\Sanbox\openclawspace\tunnel-mcp-ok`
- tools: **154**
- catalog ready: true
- duplicate tool names: **none**
- digest:
  `2ca33225b970dd70e1350d7b4e3d9290116448181031872d643111ae7ab4c374`
- post-restart source/install parity: **245/245 exact**
- preserved paths: **6/6**
- credential hash: unchanged

## Compatibility and release integrity

No public tool was removed.

The v1.2.2 tag/release was not moved, overwritten or modified. It remains the immutable 122-tool published baseline.

## Problems found and fixed

1. Static registration regex undercounted runtime tools by five.
   - Root cause: scheduled-task loop registration.
   - Resolution: deterministic expected registry + runtime tools/list comparison.

2. Current-facing docs mixed the 122-tool v1.2.2 release baseline with 154-tool current main.
   - Resolution: explicit release-vs-current wording and regression guard.

3. Filesystem legacy surfaces had weak direct regression coverage and several unbounded default outputs.
   - Resolution: dedicated suite + bounded parameters/defaults.

4. package.json check/test chains were difficult to maintain.
   - Resolution: deterministic runner scripts.

5. Large clipboard payload/restore could hit Windows command-line length and worker-output truncation.
   - Resolution: stdin transport + dedicated bounded worker output + regression test.

## Final status

**PASS / COMPLETE / DEPLOYED / LIVE GREEN**

Implementation SHA:
`885229e72380882aa6239996d0647a33e4148400`

Implementation CI:
`37003411662` / #167 — SUCCESS

Final closure SHA and closure CI are recorded after the documentation closure commit.
