# LCN-054 — Browser Control Hardening & Live Safety Boundary

Status: **COMPLETE**

## Goal

Harden the LCN-021/022/023 browser automation surface so managed sessions cannot silently reuse a user's normal browser profile, attached sessions have non-destructive stop semantics, browser results expose truthful ownership/isolation metadata, interaction semantics are more faithful, screenshots can avoid large inline MCP payloads, cleanup is observable, and live browser control can remain separate from WebDriver/CDP automation.

## Scope

1. Close profile-isolation bypass paths in Firefox and Chrome.
2. Replace generic browser option passthrough with explicit backend-safe options and reject reserved profile/debug flags.
3. Correct profile metadata:
   - profile_mode
   - profile_owned
   - profile_isolated
   - profile_cleanup_on_stop
4. Make attached-session stop detach by default; remote-session termination must be explicit.
5. Make Firefox navigation wait semantics truthful for none / interactive / complete.
6. Improve Chrome click/type fidelity using CDP Input where practical.
7. Add explicit DOM vs accessibility snapshot modes and richer live element state.
8. Add screenshot file-result mode; keep inline base64 opt-in/bounded.
9. Return cleanup evidence for managed browser stop.
10. Add a live-browser safety boundary that uses native/UI control rather than attaching WebDriver/CDP to a user's active normal profile.
11. Keep Firefox primary, Chrome secondary, and no Edge dependency.
12. Preserve v1.2.2 tag/release unchanged.

## Safety requirements

- Never use the user's normal Firefox/Chrome profile as a managed automation profile by default.
- Caller-supplied profile roots/user-data dirs are rejected unless an explicit unsafe/external-profile opt-in is present.
- Reserved Firefox/Chrome profile and remote-debugging command-line flags are rejected from generic argument arrays.
- Live mode must not enable WebDriver/CDP against a normal active profile.
- Attached sessions detach on stop unless explicit remote-close intent is supplied.
- Temp profile/process cleanup must be reported and verifiable.

## Qualification requirements

- targeted unit tests for all guards and metadata
- full npm test
- npm run check
- npm audit --audit-level=high
- physical Firefox managed smoke
- physical Chrome managed smoke
- attached-session stop semantics test
- screenshot file-result test
- cleanup/no-residue evidence
- source/install parity
- exact-commit GitHub CI
- installed runtime verification before COMPLETE

## Baseline

- source repo: main
- source HEAD at activation: 3955b0688ac18bdebe474be39229e09713eb3463
- source/origin state: clean and equal
- running LConnect: 1.2.2 / 148 tools
- current browser common tools: 9
- v1.2.2 tag/release remains immutable

## Initial findings motivating the task

- browser_start options are currently generic and allow caller-supplied profile paths/argument arrays.
- managed_profile=true can be reported even for caller-owned external profile directories.
- Firefox attached browser_stop deletes the attached WebDriver session, unlike Chrome detach-only behavior.
- Firefox navigation wait argument is reported but not fully enforced as distinct semantics.
- Chrome click/type currently rely on DOM .click()/value mutation rather than native CDP Input events.
- browser_snapshot description mentions accessibility but currently returns DOM-only data.
- screenshot results default to inline base64, which can produce large MCP payloads.
- cleanup helpers suppress cleanup failures instead of surfacing evidence.
- live native browser control exists only as lower-level window/input tools and is not yet a browser safety mode.

## Result

**COMPLETE / DEPLOYED / LIVE GREEN**

Delivered:
- isolated managed Firefox/Chrome profile defaults with explicit external-profile opt-in
- backend-safe option validation and reserved profile/debugging argument guards
- truthful profile ownership/isolation/cleanup metadata
- attached-session detach-by-default semantics with explicit remote-close intent
- Firefox managed wait semantics for `none` / `interactive` / `complete`
- Chrome CDP Input click/type fidelity
- DOM live state plus explicit accessibility snapshot mode
- file-backed screenshot default with SHA-256; bounded inline base64 remains opt-in
- managed process/profile cleanup evidence, including Firefox profile-bound process residue cleanup
- 6 live-browser tools using Windows UI Automation only:
  - `browser_live_attach`
  - `browser_live_tabs`
  - `browser_live_snapshot`
  - `browser_live_click`
  - `browser_live_type`
  - `browser_live_stop`
- live mode remains separate from WebDriver/CDP and reports `remote_automation=false`, `profile_access="none"`
- current source/runtime catalog: **154 tools**

Implementation commits:
- `e4612e4497469596551b77a1c6eb763888519e13` — browser hardening/live safety implementation
- `0b139a18f6f303025635039f912f3ee16c74eb05` — Firefox profile-process cleanup follow-up

Exact-commit CI:
- #164 / run `36995259635` — SUCCESS at `e4612e4...`
- #165 / run `36997595480` — SUCCESS at `0b139a1...`

Final implementation deployment before closure docs:
- source/install tracked parity: **236/236 exact**
- manifest digest: `45396e29b88ead2c587835f6993dfcc96f9a3e5e13557fa009f576f993b4e82d`
- preserved local paths: **6/6**
- runtime: **1.2.2 / 154 tools**
- runtime PID: `9356`
- runtime catalog digest: `2ca33225b970dd70e1350d7b4e3d9290116448181031872d643111ae7ab4c374`
- installed Firefox physical smoke: PASS, `browser_residue=0`
- installed Chrome physical smoke: PASS
- installed live Firefox UIA smoke: PASS; 21 tabs, 25-element bounded snapshot, detach-only, browser process untouched
- v1.2.2 annotated tag remains unchanged and peels to release commit `fcf3d75c6314706e3258b6c5d1345b6f637ac78f`

Operational note:
- the running LConnect runtime exposes 154 tools, but a conversation connected before the catalog expansion may still need a connector/schema reconnect before the 6 new `browser_live_*` tool schemas are directly callable.
