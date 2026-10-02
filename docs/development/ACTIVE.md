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
- Current source catalog: **148 tools**
- Installed/running daemon: **1.2.2 / 148 tools**
- Running catalog digest: `22529451eafb21024aa132a0dad5fcbe96651c542234695a0f0db565e078ab7d`
- Direct ChatGPT/LConnect runtime catalog: **148 tools** after LCN-022 runtime restart; Firefox backend is live behind the existing browser tools; an existing conversation may require connector/schema reconnect before new tool schemas are directly callable
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
- LCN-023: ACTIVE — Chrome Adapter implementation and physical CDP qualification

## Active task

[LCN-023 — Chrome Adapter](tasks/LCN-023-chrome-adapter.md) — **ACTIVE**

Current gates: implementation → local unit/smoke → physical Chrome/CDP qualification → exact-commit CI → deploy/runtime evidence.

Latest completed task: [LCN-022 — Firefox Adapter](tasks/LCN-022-firefox-adapter.md) — **COMPLETE**

Previous completed task: [LCN-021 — Browser Common Layer](tasks/LCN-021-browser-common-layer.md) — **COMPLETE**

Previous completed task: [LCN-020 — Keyboard / Mouse](tasks/LCN-020-keyboard-mouse.md) — **COMPLETE**

Previous completed task: [LCN-019 — Window Control](tasks/LCN-019-window-control.md) — **COMPLETE**

Previous completed task: [LCN-018 — Clipboard](tasks/LCN-018-clipboard.md) — **COMPLETE**

Previous completed task: [LCN-053 — v1.2.2 Secure Restart & Local Credentials Release](tasks/LCN-053-v1.2.2-secure-restart-local-credentials-release.md)

- LCN-022: COMPLETE — Firefox backend registered behind the 9 browser-common tools; physical Firefox 140.15.0esr PASS; implementation CI #159 PASS; runtime 148 tools

Latest report: [reports/LCN-20261002-022-firefox-adapter.md](reports/LCN-20261002-022-firefox-adapter.md)

Previous report: [reports/LCN-20261002-021-browser-common-layer.md](reports/LCN-20261002-021-browser-common-layer.md)

## Current reliability state

- runtime: **1.2.2 / 148 tools**
- current runtime PID after LCN-022 deployment/restart: `18280`
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
- source↔installed current tracked parity after LCN-022 implementation deployment: **228/228 exact**
- release candidate CI #146: PASS
- source and installed dependency audit: **0 vulnerabilities**
- release program/docs/checksum assets: uploaded and downloaded-back hash verified

## Next action

Complete **LCN-023 Chrome Adapter** through local tests, physical Chrome/CDP qualification, exact-commit CI, deployment, and live runtime evidence before marking it COMPLETE. Keep the existing v1.2.2 tag/release immutable.