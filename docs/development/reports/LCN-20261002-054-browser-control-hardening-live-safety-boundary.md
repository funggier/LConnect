# LCN-054 — Browser Control Hardening & Live Safety Boundary Completion Report

Date: **2026-10-02 (+07)**

Result: **COMPLETE / DEPLOYED / LIVE GREEN**

## Objective

Harden the Browser Common / Firefox / Chrome stack delivered by LCN-021–023 and add a separate live-browser control path that can operate on an already-open browser without enabling WebDriver/CDP against the user's normal profile.

The task also preserves the existing **v1.2.2** release/tag unchanged.

## Baseline

Activation baseline:
- branch: `main`
- initial source/origin state: clean/equal
- initial runtime: **1.2.2 / 148 tools**
- browser common tools: 9
- Firefox primary backend already deployed
- Chrome secondary CDP backend already deployed
- v1.2.2 release/tag immutable

## Safety findings closed

LCN-054 addressed the following review findings:

1. Generic `browser_start` options could pass backend/profile-related fields too freely.
2. Caller-owned external profile paths could be reported as managed profiles.
3. Firefox attached `browser_stop` deleted the remote WebDriver session instead of detaching by default.
4. Firefox `wait` semantics were not distinct enough.
5. Chrome click/type relied on DOM mutation rather than CDP input events.
6. `browser_snapshot` wording implied accessibility support while returning DOM-only data.
7. Screenshot output defaulted to inline base64 and could create large MCP payloads.
8. Managed cleanup errors/evidence were not sufficiently observable.
9. Live browser control did not yet have a browser-specific safety boundary separate from WebDriver/CDP.

## Delivered architecture

### Managed / attached browser automation

Common tools remain:
- `browser_start`
- `browser_attach`
- `browser_stop`
- `browser_tabs`
- `browser_navigate`
- `browser_snapshot`
- `browser_click`
- `browser_type`
- `browser_screenshot`

Managed start now:
- defaults to isolated temporary Firefox/Chrome profile storage
- reports truthful profile ownership/isolation/cleanup metadata
- rejects caller profile roots unless `unsafe_allow_external_profile=true`
- rejects reserved profile/debugging flags from generic argument arrays
- preserves Firefox-primary / Chrome-secondary architecture
- adds no Edge dependency

Attached stop now:
- detaches by default
- leaves the remote automation/browser session running
- closes the remote session only when `close_remote_session=true` is explicit

### Firefox

Firefox managed sessions:
- use `pageLoadStrategy=none`
- implement LConnect-side `wait=none|interactive|complete`
- keep WebDriver/BiDi negotiation
- expose DOM live state and accessibility-oriented projection
- surface process/profile cleanup evidence

A follow-up physical review found that geckodriver termination alone should not be relied on as proof that all Firefox processes tied to the temporary profile exited.

Follow-up repair:
- identifies Firefox processes whose command line references the exact managed temporary profile root
- kills only those profile-bound process trees
- reports `browser_process_cleanup`
- verifies `matched_after=0` before profile residue is accepted as clean

### Chrome

Chrome managed sessions:
- continue using native CDP
- reject caller `--user-data-dir`, `--profile-directory`, `--remote-debugging-port`, and `--remote-debugging-address` overrides
- use CDP `Input.dispatchMouseEvent` for click
- use CDP keyboard/input operations for typing
- use CDP Accessibility domain for accessibility snapshots
- keep isolated temporary user-data-dir by default

### Screenshot containment

`browser_screenshot` now defaults to:
- `result_mode="file"`
- file path
- byte count
- MIME type
- SHA-256

Inline base64 remains available through explicit `result_mode="inline"`.

This reduces large MCP response payloads while preserving an opt-in inline path.

### Live Browser Safety Boundary

Added 6 tools:
- `browser_live_attach`
- `browser_live_tabs`
- `browser_live_snapshot`
- `browser_live_click`
- `browser_live_type`
- `browser_live_stop`

Implementation:
- Windows UI Automation
- PID/HWND identity only
- no WebDriver endpoint
- no CDP endpoint
- no remote-debugging port
- no browser-profile access

Live session metadata explicitly reports:
- `mode="live"`
- `backend="windows-uia"`
- `remote_automation=false`
- `profile_access="none"`

`browser_live_stop` is detach-only and never closes the browser process.

## Implementation commits

Primary implementation:
`e4612e4497469596551b77a1c6eb763888519e13`

Commit message:
`feat: harden browser control safety boundary`

Follow-up Firefox cleanup:
`0b139a18f6f303025635039f912f3ee16c74eb05`

Commit message:
`fix: clean managed Firefox profile processes`

## Local qualification

PASS:
- targeted Browser Common smoke
- targeted Firefox adapter smoke
- targeted Chrome adapter smoke
- browser live safety-boundary smoke
- Firefox syntax check
- Chrome syntax check
- live module syntax check
- `npm run check`
- full `npm test`
- `npm audit --audit-level=high`: **0 vulnerabilities**
- bounded screenshot file/inline behavior
- attached Firefox detach-default + explicit remote close
- backend/profile option guards
- catalog smoke: **154 tools**

Full regression results:
- primary implementation full suite: exit 0
- Firefox cleanup follow-up full suite: exit 0, approximately 66.8 seconds

One unrelated test-harness issue was exposed during the first full-suite run:
- prior clipboard state could be `state=text` with an empty string
- WinForms can read that state but rejects `Clipboard.SetText("")`
- test cleanup was repaired to clear instead of setting empty text
- Clipboard module behavior was not changed

## Physical qualification

### Firefox managed physical

Firefox:
- version observed: **140.17.0**
- managed temporary/private profile: PASS
- tabs: PASS
- DOM snapshot: PASS
- accessibility snapshot: PASS
- Thai/Unicode typing + live value: PASS
- click + resulting DOM state: PASS
- file-backed screenshot: PASS
- navigation `none|interactive|complete`: PASS
- managed stop: PASS
- final browser-process residue: **0**
- profile cleanup: PASS

Final installed smoke output included:
`physical stop/cleanup: PASS deleted=true browser_residue=0`

### Chrome managed physical

Chrome:
- version: **154.0.8037.93**
- CDP protocol: **1.3**
- isolated managed user-data-dir: PASS
- tabs: PASS
- DOM snapshot: PASS
- CDP Accessibility snapshot: PASS
- Unicode/Thai typing through CDP Input: PASS
- click through CDP Input: PASS
- live state verification: PASS
- file-backed screenshot: PASS
- inline full-page screenshot: PASS
- navigation `none|interactive|complete`: PASS
- managed stop/cleanup: PASS

### Live browser physical

Read-only live test against the user's already-open Firefox:
- browser PID: `11724`
- backend: `windows-uia`
- remote automation: `false`
- profile access: `none`
- tabs observed: **21**
- bounded snapshot: **25 elements**
- stop result: detach-only
- browser process untouched: **true**

A separate disposable Chrome temp-profile fixture was used to physically validate live UIA actions:
- UIA InvokePattern click: PASS
- UIA ValuePattern type: PASS
- test fixture processes closed
- temporary fixture data removed

No click/type action test was performed on the user's normal Firefox profile.

## Exact-commit GitHub CI

Primary implementation:
- workflow: **LConnect CI**
- run: **#164**
- run ID: `36995259635`
- head SHA: `e4612e4497469596551b77a1c6eb763888519e13`
- result: **SUCCESS**

Firefox cleanup follow-up:
- workflow: **LConnect CI**
- run: **#165**
- run ID: `36997595480`
- head SHA: `0b139a18f6f303025635039f912f3ee16c74eb05`
- result: **SUCCESS**
- Runtime smoke tests: SUCCESS
- Dependency audit: SUCCESS

## Deployment evidence

Installed root:
`T:\Sanbox\openclawspace\tunnel-mcp-ok`

Source root:
`T:\Sanbox\openclawspace\LConnect-github`

Deployment used Git-tracked-file copy only and did not mirror/delete local runtime state.

Final implementation deployment before closure docs:
- tracked parity: **236/236 exact**
- missing: 0
- changed: 0
- unstable/error: 0
- source/install manifest digest:
  `45396e29b88ead2c587835f6993dfcc96f9a3e5e13557fa009f576f993b4e82d`

Preserved local paths:
- `mcp-conf.yaml`
- `node_modules`
- `logs`
- `runtime`
- `tunnel-client.exe`
- `local-secrets`

Preserved-path evidence: **6/6 present**

The encrypted credential file was not part of the tracked-file copy. A pre-deployment SHA-256 check remained:
`b773cace3931586913b84460c4b00cbd1ce33b78a165fa77355e259470cf2665`

## Final live runtime

After final self-restart:
- product version: **1.2.2**
- runtime PID: **9356**
- runtime root:
  `T:\Sanbox\openclawspace\tunnel-mcp-ok`
- tool count: **154**
- catalog ready: true
- catalog digest:
  `2ca33225b970dd70e1350d7b4e3d9290116448181031872d643111ae7ab4c374`

## Release integrity

The existing v1.2.2 release/tag was not modified.

Remote tag object:
`41c47b9b95ed085304e8f91c39e8dc805b53ecff`

The annotated tag peels to the original release commit:
`fcf3d75c6314706e3258b6c5d1345b6f637ac78f`

This matches the existing v1.2.2 release baseline.

## Operational note

The running runtime has **154 tools** and includes all 6 `browser_live_*` names.

A ChatGPT conversation that connected before this catalog expansion may still expose the previous connector schema. Reconnect/refresh LConnect in ChatGPT before expecting the six new tool names to be directly callable in that existing conversation.

## Closure

LCN-054 is **COMPLETE / DEPLOYED / LIVE GREEN**.

Browser Automation through LCN-054 is complete at the current scope:
- Browser Common Layer
- Firefox primary managed backend
- Chrome secondary CDP backend
- hardened isolation/attach/screenshot/cleanup semantics
- separate live-browser Windows UI Automation safety boundary
