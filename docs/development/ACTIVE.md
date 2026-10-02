# ACTIVE — LConnect Development

Last updated: 2026-10-02

## Current state

- Repository: `funggier/LConnect`
- Branch: `main`
- Latest published release: **v1.2.2 — Secure Restart & Local Credentials** (122 tools)
- Release URL: https://github.com/funggier/LConnect/releases/tag/v1.2.2
- Release tag target: `fcf3d75c6314706e3258b6c5d1345b6f637ac78f`
- Release CI: `36903887945` / #146 — PASS
- Source version: `1.2.2`
- Current source catalog: **154 tools**
- Installed/running daemon: **1.2.2 / 154 tools**
- Running catalog digest: `2ca33225b970dd70e1350d7b4e3d9290116448181031872d643111ae7ab4c374`
- Direct ChatGPT/LConnect runtime catalog: **154 tools** after LCN-054 final restart; managed Firefox/Chrome and 6 live-browser UIA tools are loaded. A conversation connected before the catalog expansion may require connector/schema reconnect before the new `browser_live_*` schemas are directly callable
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

[LCN-056 — v1.3.0 Desktop & Browser Automation Release](tasks/LCN-056-v1.3.0-desktop-browser-automation-release.md) — **ACTIVE**

Release candidate baseline starts from clean synchronized main `3a242414fab447647c85a656552b647f550ca0b5`; live runtime remains `1.2.2 / 154 tools / PID 4704` until the qualified release version is deployed.

Latest completed task: [LCN-055 — Tool Surface Cleanup & Contract Normalization](tasks/LCN-055-tool-surface-cleanup-contract-normalization.md) — **COMPLETE / DEPLOYED / LIVE GREEN**

Implementation: `885229e72380882aa6239996d0647a33e4148400` / CI #167 run `37003411662` SUCCESS. Closure docs: `ea3935eee1ab0f7fa3c2d301487fcc58ecd71390` / CI #168 run `37004582819` SUCCESS. Live runtime: `1.2.2 / 154 tools`, PID `4704`, no duplicate tool names, source/install qualified at 245/245 exact before closure-doc sync.

Next intended task: **LCN-056 — Desktop & Browser Automation Release** after release/version-policy confirmation from current repository state.

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

- runtime: **1.2.2 / 154 tools**
- current runtime PID after LCN-055 deployment/restart: `4704`
- current tunnel PID after v1.2.2 activation: `2216`
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
- source↔installed implementation tracked parity after LCN-054 final runtime qualification: **236/236 exact**
- release candidate CI #146: PASS
- source and installed dependency audit: **0 vulnerabilities**
- release program/docs/checksum assets: uploaded and downloaded-back hash verified

## Next action

LCN-054 is complete and live GREEN. Before activating the next planned tool-development task, verify live `main`/runtime state again. Keep the existing v1.2.2 tag/release immutable and do not reset the worktree.