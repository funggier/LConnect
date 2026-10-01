# ACTIVE — LConnect Development

Last updated: 2026-10-01

## Current state

- Repository: `funggier/LConnect`
- Branch: `main`
- Latest published release: **v1.2.2 — Secure Restart & Local Credentials** (122 tools)
- Release URL: https://github.com/funggier/LConnect/releases/tag/v1.2.2
- Release tag target: `fcf3d75c6314706e3258b6c5d1345b6f637ac78f`
- Release CI: `36903887945` / #146 — PASS
- Source version: `1.2.2`
- Current source catalog: **122 tools**
- Installed/running daemon: **1.2.2 / 122 tools**
- Running catalog digest: `4a8ef91a83938d4e835a7716c90c8784235708bdf31c5cb763b1d2911fecc525`
- Direct ChatGPT/LConnect runtime catalog: **122 tools**
- LCN-046: COMPLETE — original round-boundary implementation; handler-sum enforcement superseded by LCN-047 evidence
- LCN-047: COMPLETE — Turn-Risk Telemetry Model Repair / observation-only live GREEN
- LCN-048: COMPLETE — Retry Tail-Gap Telemetry Refinement / live GREEN
- LCN-049: COMPLETE — Legacy MaxLatency compatibility surface removed / live GREEN
- LCN-050: COMPLETE — Post-Retry Auto-Round and GitHub Wait Payload Containment / live GREEN
- LCN-051: COMPLETE — v1.2.1 published, deployed and verified
- LCN-052: COMPLETE — DPAPI local credential persistence + detached self-restart / live GREEN
- LCN-018–023: DEFERRED — Desktop Control / Browser Automation

## Active task

No active development task.

Latest completed task: [LCN-053 — v1.2.2 Secure Restart & Local Credentials Release](tasks/LCN-053-v1.2.2-secure-restart-local-credentials-release.md)

- LCN-053: COMPLETE — v1.2.2 published, deployed and verified

Latest report: [reports/LCN-20261002-053-v1.2.2-secure-restart-local-credentials-release.md](reports/LCN-20261002-053-v1.2.2-secure-restart-local-credentials-release.md)

Previous report: [reports/LCN-20261001-052-secure-local-credential-persistence-self-restart.md](reports/LCN-20261001-052-secure-local-credential-persistence-self-restart.md)

## Current reliability state

- runtime: **1.2.2 / 122 tools**
- current runtime PID after v1.2.2 activation: `2640`
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
- source↔installed current tracked parity after v1.2.2 deployment: **212/212 exact**
- release candidate CI #146: PASS
- source and installed dependency audit: **0 vulnerabilities**
- release program/docs/checksum assets: uploaded and downloaded-back hash verified

## Next action

Use v1.2.2 normally. Secure local credential persistence and detached self-restart are now part of the published baseline. Desktop Control LCN-018–020 and Browser Automation LCN-021–023 remain deferred.