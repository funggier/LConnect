# ACTIVE — LConnect Development

Last updated: 2026-09-24

## Current state

- Repository: `funggier/LConnect`
- Branch: `main`
- Current implementation candidate: `ac3d4a9a0ff9f10a12dc54df8bba47f900f99aec`
- Passing implementation CI: `35980718759` — PASS
- Current source MCP catalog: 113 tools
- Current installed/runtime catalog: 113 tools
- Current runtime catalog digest: `d5038c67f856a5eda6b5bc8fd9c70f90108095d2633ba6e82ccc604396084f72`
- Current ChatGPT-visible catalog before plugin refresh: 112 tools — stale schema directly confirmed by `runtime_catalog`
- LCN-025/026: COMPLETE
- LCN-031/032: COMPLETE
- LCN-033: COMPLETE — live telemetry measured approximately 96.7% sampled wall time outside handlers
- LCN-034: COMPLETE + LIVE VALIDATED — five equivalent individual reads measured 9963 ms caller wall versus 2667 ms through one `batch_inspect` call (approximately 73.2% reduction)
- LCN-027: COMPLETE — Structured Text Search
- LCN-028: COMPLETE — File Integrity
- LCN-029: COMPLETE — Exact Git Ref / Ancestry Safety
- LCN-030: COMPLETE — GitHub Actions / Release Integration
- LCN-025–030: COMPLETE — Agent Operations Reliability core sequence
- LCN-035: COMPLETE + LIVE VALIDATED — Turn-Safe Long Operation Observation
- LCN-036: COMPLETE + LIVE VALIDATED — Runtime Catalog Visibility / Refresh Evidence
- LCN-037: ACTIVE — GitHub Wait Budget Separation

## Active task

**LCN-037 — GitHub Wait Budget Separation**

## Latest completed task

### LCN-030 — GitHub Actions / Release Integration

Status: **COMPLETE**

Task: [tasks/LCN-030-github-actions-release.md](tasks/LCN-030-github-actions-release.md)

Report: [reports/LCN-20260924-030-github-actions-release.md](reports/LCN-20260924-030-github-actions-release.md)

Message-delivery observation: [reports/LCN-20260924-message-delivery-timeout-observation.md](reports/LCN-20260924-message-delivery-timeout-observation.md)

## Next action

Deploy the CI-green LCN-037 repair to the installed 113-tool runtime, restart LConnect (no plugin refresh required), and requalify `github_run_wait` against a real GitHub Actions run. Then close LCN-037 and continue delivery-layer latency work. Continue latency/message-delivery mitigation afterward.
