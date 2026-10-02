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
- Current source catalog: **133 tools**
- Installed/running daemon: **1.2.2 / 133 tools**
- Running catalog digest: `c9e09c413dfaab80b2885fb6b43006bdfe7ac8fc2fee1446f3310480d8a19b89`
- Direct ChatGPT/LConnect runtime catalog: **133 tools** after LCN-019 runtime restart; an existing conversation may require connector/schema reconnect before new tool names are directly callable
- LCN-046: COMPLETE — original round-boundary implementation; handler-sum enforcement superseded by LCN-047 evidence
- LCN-047: COMPLETE — Turn-Risk Telemetry Model Repair / observation-only live GREEN
- LCN-048: COMPLETE — Retry Tail-Gap Telemetry Refinement / live GREEN
- LCN-049: COMPLETE — Legacy MaxLatency compatibility surface removed / live GREEN
- LCN-050: COMPLETE — Post-Retry Auto-Round and GitHub Wait Payload Containment / live GREEN
- LCN-051: COMPLETE — v1.2.1 published, deployed and verified
- LCN-052: COMPLETE — DPAPI local credential persistence + detached self-restart / live GREEN
- LCN-018: COMPLETE — Clipboard text control / exact-commit CI + deployed runtime GREEN
- LCN-019: COMPLETE — Native Window Control / exact-commit CI + deployed runtime GREEN
- LCN-020–023: DEFERRED — Keyboard-Mouse / Browser Automation

## Active task

No active development task.

Latest completed task: [LCN-019 — Window Control](tasks/LCN-019-window-control.md) — **COMPLETE**

Previous completed task: [LCN-018 — Clipboard](tasks/LCN-018-clipboard.md) — **COMPLETE**

Previous completed task: [LCN-053 — v1.2.2 Secure Restart & Local Credentials Release](tasks/LCN-053-v1.2.2-secure-restart-local-credentials-release.md)

- LCN-019: COMPLETE — 8 native Window Control tools added; implementation CI #153 PASS; runtime 133 tools

Latest report: [reports/LCN-20261002-019-window-control.md](reports/LCN-20261002-019-window-control.md)

Previous report: [reports/LCN-20261002-018-clipboard.md](reports/LCN-20261002-018-clipboard.md)

## Current reliability state

- runtime: **1.2.2 / 133 tools**
- current runtime PID after LCN-019 deployment/restart: `1264`
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
- source↔installed current tracked parity after LCN-019 implementation deployment: **218/218 exact**
- release candidate CI #146: PASS
- source and installed dependency audit: **0 vulnerabilities**
- release program/docs/checksum assets: uploaded and downloaded-back hash verified

## Next action

Begin **LCN-020 Keyboard / Mouse** only after verifying live GitHub/runtime state. Keep the existing v1.2.2 tag/release immutable.