# LCN-054 — Browser Control Hardening & Live Safety Boundary

Status: **ACTIVE**

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

In progress.
