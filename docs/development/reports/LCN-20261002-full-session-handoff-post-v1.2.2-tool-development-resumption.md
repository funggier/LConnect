# LConnect Full Session Handoff — Post-v1.2.2 Tool Development Resumption

Date: **2026-10-02 (+07)**

Purpose: hand off the project to a fresh session after the v1.2.2 release so development can resume on the previously deferred Desktop Control and Browser Automation tool plan.

---

## 1. Authority order

For the next session, use this order of authority:

1. live GitHub / local Git state
2. live installed/runtime state
3. this handoff
4. `ACTIVE.md`, `STATUS.md`, `ROADMAP.md`, `DECISIONS.md`
5. historical task/report files

Do **not** treat an older SHA in a historical report as current without verification.

Do **not** reset the worktree merely to match an older handoff.

---

## 2. Verified baseline at handoff

Repository:

- GitHub: `funggier/LConnect`
- source root: `T:\Sanbox\openclawspace\LConnect-github`
- branch: `main`
- current main HEAD: `a2fcb4ad1a5dc01cc747536fb89036b7bd5ae60d`
- `main == origin/main`
- ahead / behind: `0 / 0`
- worktree: **clean**

Published release:

- version: **v1.2.2**
- name: **LConnect v1.2.2 — Secure Restart & Local Credentials**
- release tag: `v1.2.2`
- exact release commit / peeled tag target: `fcf3d75c6314706e3258b6c5d1345b6f637ac78f`
- annotated tag object: `41c47b9b95ed085304e8f91c39e8dc805b53ecff`
- release CI: **#146 / run `36903887945` — PASS**
- release assets: 11
- downloaded-back asset hash verification: **PASS / 0 mismatches**

Post-release closure:

- closure commit: `a2fcb4ad1a5dc01cc747536fb89036b7bd5ae60d`
- closure CI: **#148 / run `36904974194` — PASS**

### Important SHA distinction

The immutable v1.2.2 release tag points to:

`fcf3d75c6314706e3258b6c5d1345b6f637ac78f`

Current `main` is newer:

`a2fcb4ad1a5dc01cc747536fb89036b7bd5ae60d`

The newer commit is the post-publication documentation closure. **Do not move, recreate, or overwrite the v1.2.2 tag/release.**

---

## 3. Installed/runtime baseline

Installed root:

`T:\Sanbox\openclawspace\tunnel-mcp-ok`

Verified live runtime:

- version: **1.2.2**
- MCP catalog: **122 tools**
- runtime PID at handoff: `2640`
- tunnel PID at handoff: `2216`
- catalog digest: `4a8ef91a83938d4e835a7716c90c8784235708bdf31c5cb763b1d2911fecc525`
- runtime working directory: installed root
- catalog ready: true

Final source/install evidence:

- tracked parity: **212/212 exact**
- missing tracked files: 0
- changed tracked files: 0
- final source/install manifest digest:
  `39007e85641358ed5a34129713cdefebddf92baa996ee3472c924b25b5777f5f`

Local credential/restart baseline:

- file: `local-secrets\credentials.json.enc`
- protection: Windows DPAPI / `CurrentUser`
- decrypt test: **PASS**
- Runtime API key: configured
- Organization ID: configured
- ACL hardened: **True**
- detached self-restart: previously validated live
- Runtime API key is not passed on the restart command line

Preserve these local-only paths on every deploy/update:

- `mcp-conf.yaml`
- `node_modules\`
- `logs\`
- `runtime\`
- `tunnel-client.exe`
- `local-secrets\`

Never commit local secrets or tunnel configuration.

---

## 4. Just-completed work

### LCN-052 — Secure Local Credential Persistence & Self-Restart

**COMPLETE / LIVE GREEN**

Added:

- Windows DPAPI / CurrentUser local encrypted credential
- restricted ACL
- first-run save flow
- explicit setup/status/clear commands
- non-interactive startup using stored credential
- detached self-restart
- preservation of local secret state during deploy/refresh

### LCN-053 — v1.2.2 Secure Restart & Local Credentials Release

**COMPLETE / PUBLISHED / DEPLOYED / VERIFIED**

This is the current stable baseline before GUI/browser expansion resumes.

---

## 5. Pending tool-development plan

The following tasks remain intentionally deferred and are now the next expansion sequence.

Recommended implementation order:

`LCN-018 → LCN-019 → LCN-020 → LCN-021 → LCN-022 → LCN-023`

Do not skip directly to browser adapters before the common browser layer unless new evidence justifies changing the architecture.

### LCN-018 — Clipboard

Current status: **DEFERRED**

Planned MCP tools:

- `clipboard_get`
- `clipboard_set`
- `clipboard_clear`

Initial scope:

- text clipboard only
- Unicode-safe roundtrip
- structured schema/results
- bounded output
- explicit failure semantics

Recommended first task for the new session.

Important test hygiene:

- do not destroy the user's existing clipboard during live acceptance
- capture/restore the prior clipboard value where practical
- test Thai/Unicode text
- test empty clipboard
- test set → get exact roundtrip
- test clear
- report non-text/unavailable state explicitly rather than guessing
- keep implementation dependencies minimal

Windows implementation note:

If using .NET `System.Windows.Forms.Clipboard`, account for STA-thread requirements. Evaluate the smallest deterministic approach before committing the implementation architecture.

### LCN-019 — Window Control

Current status: **DEFERRED**

Planned MCP tools:

- `list_windows`
- `get_window`
- `focus_window`
- `move_window`
- `resize_window`
- `minimize_window`
- `maximize_window`
- `close_window`

Design requirements:

- prefer HWND identity over title-only heuristics
- report HWND + PID + title/class evidence
- avoid destructive selection by wildcard/title ambiguity
- support multi-monitor coordinates, including negative desktop coordinates
- explicitly decide DPI/coordinate semantics before move/resize acceptance
- test mutations against disposable fixture windows

### LCN-020 — Keyboard / Mouse

Current status: **DEFERRED**

Planned MCP tools:

- `key_press`
- `key_combo`
- `type_text`
- `mouse_move`
- `mouse_click`
- `mouse_scroll`

Design boundary:

Keyboard/mouse input is a **desktop/fallback control layer**, not the primary browser DOM strategy.

Tests should target disposable UI fixtures and avoid uncontrolled interaction with the user's active desktop wherever possible.

### LCN-021 — Browser Common Layer

Current status: **DEFERRED**

Planned common capabilities:

- start
- attach where deterministic
- stop
- tabs
- navigate
- snapshot/query
- click
- type
- screenshot
- capability negotiation

Architecture:

- common browser session API above backend adapters
- backend identity/capabilities exposed explicitly
- browser-specific behavior stays behind adapters or explicit escape hatches
- long-lived browser work should use bounded/session-style lifecycle rather than one long MCP request
- no Microsoft Edge dependency

### LCN-022 — Firefox Adapter

Current status: **DEFERRED**

Firefox is the **primary first-class browser backend**.

Direction:

- WebDriver BiDi baseline
- geckodriver / Marionette where useful
- Windows 10 acceptance
- managed Firefox profile/instance first
- attach to an existing Firefox only where technically deterministic and safe
- do not use Firefox CDP as the architecture baseline

### LCN-023 — Chrome Adapter

Current status: **DEFERRED**

Chrome is the secondary browser backend.

Direction:

- Chrome DevTools Protocol (CDP)
- map into the common Browser API
- preserve optional Chrome-specific diagnostics/escape hatch
- Edge is not required

---

## 6. Decisions the new session must preserve

Relevant existing decisions in `DECISIONS.md`:

- **D-007:** long operations use session/job patterns
- **D-008:** system/development foundation before GUI automation — that prerequisite is now complete
- **D-009:** Firefox is primary browser
- **D-010:** Chrome is secondary browser
- **D-011:** Edge is not required
- **D-012:** user-facing browser API sits above backend adapters
- **D-013:** keyboard/mouse is fallback, not browser DOM strategy

Other project invariants:

- one main MCP channel
- modular modules with structured schemas
- full-machine access is bounded by the Windows account/ACL/UAC; LConnect does not bypass Windows security
- bounded outputs
- explicit timeout semantics
- preserve root cause in errors
- minimal external dependencies
- relocatable installation
- tests before declaring a tool complete
- exact commit / CI evidence required for closure
- deployment/runtime evidence required when production modules change

---

## 7. Reliability rules that remain active

Current turn telemetry:

- model: `turn_risk_observation_v2`
- mode: **OBSERVE**
- enforcement: **disabled**
- no MaxLatency/safe-max blocking
- `ConfirmRetry-LConnect.cmd` remains the explicit user-confirmed Retry marker
- first non-control work tool after a confirmed Retry auto-starts the next observation round

GitHub:

- `github_run_wait` returns compact top-level status
- use `github_run_view` for jobs/steps detail

Long-running work:

- do not solve upstream timeout by simply increasing timeout values
- prefer `start_process` + bounded `wait_session` / incremental reads where appropriate

Known UI behavior:

- ChatGPT may show `Error in input stream` while LConnect/local execution continues
- before retrying a side-effecting operation, verify whether the original local work is still running or already completed
- do not equate a ChatGPT stream error with a local LConnect crash without evidence

---

## 8. Immediate start procedure for the next session

When the new session begins:

1. Connect to LConnect.
2. Verify live Git/GitHub state before trusting this handoff.
3. Verify direct `runtime_catalog`.
4. Read, in order:
   - `docs/development/ACTIVE.md`
   - `docs/development/STATUS.md`
   - `docs/development/ROADMAP.md`
   - `docs/development/DECISIONS.md`
   - `docs/development/TASK_INDEX.md`
   - this handoff
   - `docs/development/tasks/LCN-018-clipboard.md`
5. If baseline still matches and no newer task has been opened, resume **LCN-018 Clipboard**.
6. Change LCN-018 from `DEFERRED` to `ACTIVE` only when implementation actually starts.
7. Update `ACTIVE.md`, `STATUS.md`, and `TASK_INDEX.md` accordingly.
8. Do not create a replacement task number for Clipboard unless the scope genuinely splits into a separate concern.
9. Implement with tests first/alongside implementation.
10. Run:
    - targeted smoke tests
    - `npm run check`
    - full `npm test`
    - `npm audit --audit-level=high`
    - `git diff --check`
11. Commit and push exact implementation SHA.
12. Require exact-commit GitHub CI PASS.
13. Deploy tracked source to `tunnel-mcp-ok` while preserving all local-only paths.
14. For runtime module changes, use the validated restart path and then verify:
    - source/install tracked parity
    - runtime version
    - tool count
    - runtime root
    - new tools callable
15. Close LCN-018 only after local + CI + installed/runtime evidence is GREEN.
16. Then proceed to LCN-019.

---

## 9. Expected first-session development target

Primary objective:

**Implement and qualify LCN-018 Clipboard without destabilizing the v1.2.2 reliability baseline.**

Do not begin LCN-019 in the same task merely because Clipboard finishes quickly. Close LCN-018 cleanly with evidence first, then open/activate LCN-019.

Do not create a new release automatically after each tool task. Release cadence should be decided after a meaningful tool-development milestone unless the user explicitly requests otherwise.

---

## 10. Suggested opening instruction for the new ChatGPT session

> ทำ LConnect ต่อจาก Full Handoff ล่าสุด โดยยึด GitHub/runtime สดเป็น authoritative source ก่อนเอกสารเก่า ตรวจ main และ runtime ก่อน แล้วเริ่มพัฒนาเครื่องมือตามแผนที่ค้างอยู่ โดยเริ่มจาก LCN-018 Clipboard ก่อน อย่า reset worktree และอย่าแก้/ย้าย v1.2.2 tag/release เดิม เมื่อเริ่มงานจริงให้เปลี่ยน LCN-018 เป็น ACTIVE และทำจนมี local tests, exact-commit CI, deploy/runtime evidence ก่อนปิด task

---

## 11. Handoff state

- no active development task at handoff
- next intended task: **LCN-018 Clipboard**
- v1.2.2 remains the stable published baseline
- Desktop/Browser work is no longer blocked by unfinished foundation work; it was deferred by choice and is ready to resume when the next session starts
