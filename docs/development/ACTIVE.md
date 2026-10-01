# ACTIVE — LConnect Development

Last updated: 2026-10-01

## Current state

- Repository: `funggier/LConnect`
- Branch: `main`
- Latest published release: **v1.2.1 — Turn-Risk & Retry Reliability** (122 tools)
- Release URL: https://github.com/funggier/LConnect/releases/tag/v1.2.1
- Release tag target: `5d3c7e5381b1efd188a8f175612f67ee94fe3c86`
- Release CI: `36850514776` / #138 — PASS
- Source version: `1.2.2`
- Current source catalog: **122 tools**
- Installed/running daemon: **1.2.1 / 122 tools** (v1.2.2 activation pending)
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

[LCN-053 — v1.2.2 Secure Restart & Local Credentials Release](tasks/LCN-053-v1.2.2-secure-restart-local-credentials-release.md)

Latest completed task: [LCN-052 — Secure Local Credential Persistence & Self-Restart](tasks/LCN-052-secure-local-credential-persistence-self-restart.md)

- LCN-053: ACTIVE — prepare, qualify, deploy and publish v1.2.2

Latest report: [reports/LCN-20261002-053-v1.2.2-secure-restart-local-credentials-release.md](reports/LCN-20261002-053-v1.2.2-secure-restart-local-credentials-release.md)

Previous report: [reports/LCN-20261001-052-secure-local-credential-persistence-self-restart.md](reports/LCN-20261001-052-secure-local-credential-persistence-self-restart.md)

## Current reliability state

- runtime: **1.2.1 / 122 tools** (v1.2.2 activation pending)
- current runtime PID after LCN-052 live restart: `8864`
- current tunnel PID after LCN-052 live restart: `11552`
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
- source↔installed current tracked parity after LCN-052 deployment: **210/210 exact**
- release candidate CI #138: PASS
- source and installed dependency audit: **0 vulnerabilities**
- release program/docs/checksum assets: uploaded and downloaded-back hash verified

## Next action

Qualify the v1.2.2 release candidate, require exact-commit CI GREEN, deploy/activate 1.2.2 / 122 tools while preserving `local-secrets/`, build release assets from the exact release commit, publish tag/release, and verify downloaded asset hashes.