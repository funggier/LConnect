# LCN 2026-09-24 — LCN-044 Deployment Verification Snapshot

## Result

**COMPLETE — IMPLEMENTED, DEPLOYED, LIVE VERIFIED AND RELEASED IN v1.2.0**

## Goal

Reduce the repeated post-deploy verification sequence to one bounded read-only evidence call while preserving the architecture boundary that ChatGPT/operator owns deployment and release decisions.

## Tool

Added: `deployment_verification_snapshot`

Catalog: `119 → 120 tools`

## Evidence combined in one call

- exact Git-tracked source↔installed streamed SHA-256 parity
- bounded missing/changed/unstable evidence and manifest digests
- source/installed package version parity
- direct dependency declarations and installed package presence/version
- preserved local paths: `mcp-conf.yaml`, `node_modules`, `logs`, `runtime` by default
- running runtime version/PID/start/working directory/tool count/catalog digest
- optional expected tool-count match

Untracked local-only runtime/config paths do not affect tracked-file parity. Tracked symlinks/special entries are not silently followed as equal deployment files.

## Bounds and stability

- existing allowed-path guard
- bounded tracked-file count
- bounded per-file and total bytes
- streamed hashing
- before/after handle/path stability checks
- bounded differences/diagnostics
- bounded final response with compact/minimal fallback

## Decision boundary

The tool reports deterministic evidence only. It does not copy/install/restart/refresh/deploy/tag/release or decide whether those actions should proceed.

## Version source-of-truth hardening

Release preparation also added `modules/version.mjs`. Runtime product version now comes from `package.json` and feeds MCP server version, runtime catalog version and startup log version. `tests/version-smoke.mjs` prevents future drift.

## Local validation

- clean tracked parity: PASS
- changed tracked file: PASS
- missing installed tracked file: PASS
- preserved paths independent from tracked parity: PASS
- dependency declaration/presence/version evidence: PASS
- runtime version/catalog evidence: PASS
- expected tool-count mismatch evidence: PASS
- resource/output bounds: PASS
- restricted path guard: PASS
- source smoke: `PASS tools=120`
- full suite before release version bump: PASS, approximately 52.6 seconds
- dependency audit: 0 vulnerabilities
- post-bump package/runtime source-of-truth: PASS (`1.2.0`)
- post-bump deployment snapshot targeted smoke: PASS
- post-bump source smoke: `PASS tools=120`
- post-bump syntax check: PASS

## Final v1.2.0 local release-candidate validation

- package/runtime version source-of-truth: PASS (`1.2.0`)
- source catalog: `PASS tools=120`
- `npm run check`: PASS
- full `npm test`: PASS, approximately 53.3 seconds
- Windows PowerShell syntax gate: PASS for install/update/start/status/stop/maintenance/test scripts
- dependency audit: 0 vulnerabilities
- `git diff --check`: PASS

## Final deployment / live evidence

- exact release-candidate commit: `043a669a7f421db21586e4fb5cd3645ef0f44c60`
- GitHub CI run `36005012233` / #117: PASS
- deployed tracked files: 178
- source↔installed pre-restart hash parity: 178/178 exact
- preserved local paths: `mcp-conf.yaml`, `node_modules`, `logs`, `runtime` all present
- installed source smoke: `PASS tools=120`
- activated tunnel daemon: version `1.2.0`, 120 tools, working directory `T:\Sanbox\openclawspace\tunnel-mcp-ok`
- activated daemon catalog digest: `3fe695d2143f49aff416714e5a5d9b89049e6c208f6da2176bb3884e577f20ff`
- production-composed installed snapshot: PASS
- snapshot tracked parity: 178/178, zero missing/changed/unstable
- snapshot source/install manifest digest: `9ec6870289b0206cc10a036b055d7453fefcde4dc8ddcb03a7ab3e309c4584f6`
- package version parity: `1.2.0` / `1.2.0`
- direct dependencies present: 4/4
- preserved paths all present: PASS
- snapshot runtime root/version/tool-count checks: PASS
- snapshot runtime catalog digest equals activated daemon digest: PASS

## Release

Published in `v1.2.0 — Reliability & Verification`:

https://github.com/funggier/LConnect/releases/tag/v1.2.0