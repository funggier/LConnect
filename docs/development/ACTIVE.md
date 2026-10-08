# ACTIVE — LConnect Development

Last updated: 2026-10-02

## Current state

- Repository: `funggier/LConnect`
- Branch: `main`
- Latest published release: **v1.3.0 — Desktop & Browser Automation** (154 tools)
- Release URL: https://github.com/funggier/LConnect/releases/tag/v1.3.0
- Release tag target: `3e685ba0596bf00b9e4546c0dc8d9293fbdbd761`
- Release CI: `37009797481` / #171 — PASS
- Source version: `1.3.0`
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

[LCN-057 — Security & Operational Hygiene](tasks/LCN-057-security-operational-hygiene.md) — **ACTIVE / LOCAL QUALIFICATION GREEN**

Scope: dependency security, bounded `search_files` traversal, managed-session registry hygiene, Windows `.cmd/.bat` managed launch consistency, lifetime telemetry aggregates, observation-only idle round rollover, and volatile-state documentation cleanup.

Local qualification on 2026-10-08: syntax PASS (84 files), full test runner PASS (39 Node + 1 PowerShell), `npm audit --audit-level=high` = 0 vulnerabilities, MCP SDK 1.32.1, proxy-addr 2.0.8, `git diff --check` PASS. Exact-commit CI/deployment/runtime acceptance are still required before closure.

Latest completed task: [LCN-056 — v1.3.0 Desktop & Browser Automation Release](tasks/LCN-056-v1.3.0-desktop-browser-automation-release.md) — **COMPLETE / PUBLISHED / DEPLOYED / LIVE GREEN**

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

LCN-057 is active from the verified post-v1.3.0 baseline. Local qualification is GREEN; next gates are exact-commit CI, tracked-only deployment with preserved local state, secure restart and live runtime/parity acceptance. Keep both v1.3.0 and historical v1.2.2 tag/release evidence immutable and do not reset the worktree.