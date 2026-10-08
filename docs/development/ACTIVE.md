# ACTIVE — LConnect Development

Last updated: 2026-10-02

## Current state

- Repository: `funggier/LConnect`
- Branch: `main`
- Latest published release: **v1.3.0 — Desktop & Browser Automation** (154 tools)
- Release URL: https://github.com/funggier/LConnect/releases/tag/v1.3.0
- Release tag target: `3e685ba0596bf00b9e4546c0dc8d9293fbdbd761`
- Release CI: `37009797481` / #171 — PASS
- Source version: `1.3.1`
- Current source catalog: **154 tools**
- Installed/running daemon baseline: **1.3.0 / 154 tools**; use `runtime_catalog` for the volatile current PID
- Running catalog digest: `2ca33225b970dd70e1350d7b4e3d9290116448181031872d643111ae7ab4c374`
- Direct ChatGPT/LConnect runtime catalog: **154 tools** on v1.3.0; managed Firefox/Chrome and 6 live-browser UIA tools are loaded. A conversation connected before a schema change may require connector/schema reconnect before newly added schema fields are directly callable
- LCN-046: COMPLETE — original round-boundary implementation; handler-sum enforcement superseded by LCN-047 evidence
- LCN-047: COMPLETE — Turn-Risk Telemetry Model Repair / observation-only live GREEN
- LCN-048: COMPLETE — Retry Tail-Gap Telemetry Refinement / live GREEN
- LCN-049: COMPLETE — Legacy MaxLatency compatibility surface removed / live GREEN
- LCN-050: COMPLETE — Post-Retry Auto-Round and GitHub Wait Payload Containment / live GREEN
- LCN-051: COMPLETE — v1.2.1 published, deployed and verified
- LCN-052: COMPLETE — DPAPI local credential persistence + detached self-restart / live GREEN
- LCN-018: COMPLETE — Clipboard text control / exact-commit CI + deployed runtime GREEN
- LCN-019: COMPLETE — Native Window Control / exact-commit CI + deployed runtime GREEN
- LCN-020: COMPLETE — Keyboard / Mouse native input / exact-commit CI + deployed runtime GREEN
- LCN-021: COMPLETE — Browser Common Layer / exact-commit CI + deployed runtime GREEN
- LCN-022: COMPLETE — Firefox Adapter / physical Firefox + exact-commit CI + deployed runtime GREEN
- LCN-023: COMPLETE — Chrome Adapter / physical CDP + exact-commit CI + deployed runtime GREEN
- LCN-054: COMPLETE — Browser Control Hardening & Live Safety Boundary / exact-commit CI + deployed runtime + physical Firefox/Chrome/live UIA GREEN

## Active task

[LCN-059 — v1.3.1 Operational Hardening Release](tasks/LCN-059-v1.3.1-operational-hardening-release.md) — **ACTIVE / LOCAL RELEASE QUALIFICATION GREEN**

Release target: v1.3.1 / 154 tools. Scope packages qualified LCN-057 security/operational hardening plus LCN-058 optional AtLogOn persistence; v1.3.0 and v1.2.2 remain immutable. Local release qualification: syntax 84 PASS, PowerShell 20 PASS, 39 Node + 2 PowerShell suites PASS, audit 0 vulnerabilities, tool surface/docs guard 154/no duplicates, diff check PASS.

Latest completed task: [LCN-058 — Optional AtLogOn Persistence](tasks/LCN-058-optional-atlogon-persistence.md) — **COMPLETE / DEPLOYED / PHYSICAL GREEN**

Authoritative implementation `973328c9dc51ed76ca6ee96517932a64dd75caf6`; CI #178 / run `37817126580` SUCCESS; deployed 259/259 exact before closure docs; disposable physical install/idempotence/drift-repair/remove PASS; default `\\LConnect Autostart` remained absent; credential hash preserved. Report: [LCN-20261009-058-optional-atlogon-persistence.md](reports/LCN-20261009-058-optional-atlogon-persistence.md).

Latest completed task: [LCN-057 — Security & Operational Hygiene](tasks/LCN-057-security-operational-hygiene.md) — **COMPLETE / DEPLOYED / LIVE GREEN**

Implementation `c949c3239cc5ede9e285dfd605b0e62392bdde4b`; CI #175 / run `37810517540` SUCCESS; deployed 249/249 exact; live runtime 1.3.0 / 154 tools / PID 15508; npm audit 0 vulnerabilities; credential hash preserved. Report: [LCN-20261008-057-security-operational-hygiene.md](reports/LCN-20261008-057-security-operational-hygiene.md).

Previous completed task: [LCN-056 — v1.3.0 Desktop & Browser Automation Release](tasks/LCN-056-v1.3.0-desktop-browser-automation-release.md) — **COMPLETE / PUBLISHED / DEPLOYED / LIVE GREEN**

Release commit: `3e685ba0596bf00b9e4546c0dc8d9293fbdbd761`; CI #171 / run `37009797481` SUCCESS; release-qualification runtime was `1.3.0 / 154 tools / PID 17900`; source/install release parity 247/247 exact; release assets downloaded-back with zero hash mismatch.

Latest completed task: [LCN-055 — Tool Surface Cleanup & Contract Normalization](tasks/LCN-055-tool-surface-cleanup-contract-normalization.md) — **COMPLETE / DEPLOYED / LIVE GREEN**

Implementation: `885229e72380882aa6239996d0647a33e4148400` / CI #167 run `37003411662` SUCCESS. Closure docs: `ea3935eee1ab0f7fa3c2d301487fcc58ecd71390` / CI #168 run `37004582819` SUCCESS. Live runtime: `1.2.2 / 154 tools`, PID `4704`, no duplicate tool names, source/install qualified at 245/245 exact before closure-doc sync.

Current direction: v1.3.0 is published and verified. Preserve both v1.3.0 and historical v1.2.2 release/tag evidence; open a new numbered task for future capability work.

Previous completed task: [LCN-023 — Chrome Adapter](tasks/LCN-023-chrome-adapter.md) — **COMPLETE**

Previous completed task: [LCN-022 — Firefox Adapter](tasks/LCN-022-firefox-adapter.md) — **COMPLETE**

Previous completed task: [LCN-021 — Browser Common Layer](tasks/LCN-021-browser-common-layer.md) — **COMPLETE**

Previous completed task: [LCN-020 — Keyboard / Mouse](tasks/LCN-020-keyboard-mouse.md) — **COMPLETE**

Previous completed task: [LCN-019 — Window Control](tasks/LCN-019-window-control.md) — **COMPLETE**

Previous completed task: [LCN-018 — Clipboard](tasks/LCN-018-clipboard.md) — **COMPLETE**

Previous completed task: [LCN-053 — v1.2.2 Secure Restart & Local Credentials Release](tasks/LCN-053-v1.2.2-secure-restart-local-credentials-release.md)

- LCN-022: COMPLETE — Firefox backend registered behind the 9 browser-common tools; physical Firefox 140.15.0esr PASS; implementation CI #159 PASS; runtime 148 tools

Latest report: [reports/LCN-20261002-054-browser-control-hardening-live-safety-boundary.md](reports/LCN-20261002-054-browser-control-hardening-live-safety-boundary.md)

Previous report: [reports/LCN-20261002-023-chrome-adapter.md](reports/LCN-20261002-023-chrome-adapter.md)

Previous report: [reports/LCN-20261002-021-browser-common-layer.md](reports/LCN-20261002-021-browser-common-layer.md)

## Current reliability state

- runtime: **1.3.0 / 154 tools**
- v1.3.0 release-qualification runtime PID (historical evidence): `17900`
- v1.3.0 release-qualification tunnel PID (historical evidence): `8940`
- live PID values are volatile; use `runtime_catalog` / process/status tools as authoritative current evidence
- runtime root: `T:\Sanbox\openclawspace\tunnel-mcp-ok`
- measurement model: `turn_risk_observation_v2`
- mode: **OBSERVE**
- enforcement: **disabled**
- `tail_idle_ms`: live
- `max_observed_gap_ms`: live
- first work tool after ConfirmRetry auto-starts the next observation round
- `github_run_wait`: compact top-level status; jobs/steps remain in `github_run_view`
- local encrypted credential: DPAPI / CurrentUser, decrypt + ACL PASS
- detached self-restart: live GREEN; no Runtime API key on restart command line
- v1.3.0 release deployment source↔installed tracked parity: **247/247 exact** at release activation; post-release closure/docs commits do not move the immutable v1.3.0 tag
- v1.3.0 release commit CI #171 / run `37009797481`: PASS
- LCN-056 closure commit CI #173 / run `37011488110`: PASS
- source and installed dependency audit: **0 vulnerabilities**
- release program/docs/checksum assets: uploaded and downloaded-back hash verified

## Next action

LCN-059 is active. Prepare and qualify v1.3.1 from the verified LCN-057/058 baseline, then deploy/restart, tag, publish, checksum and download-back verify. Keep v1.3.0 and v1.2.2 immutable and do not reset the worktree.