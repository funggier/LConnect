# LCN-044 — Deployment Verification Snapshot

Status: **ACTIVE — LOCAL IMPLEMENTATION GREEN / FINAL CI + INSTALLED LIVE VALIDATION PENDING**

## Goal

Collapse the repeated post-deploy verification sequence into one bounded read-only evidence call without moving deployment/release decisions into LConnect.

The repeated manual sequence currently includes:

- enumerate Git-tracked source files
- verify source ↔ installed tracked-file parity
- inspect package/version parity
- inspect direct dependency presence
- verify local-only preserved runtime/config paths still exist
- verify the running daemon points at the installed root
- verify runtime version/catalog against expected values

## Tool

`deployment_verification_snapshot`

Read-only. No copy, install, restart, refresh, Git mutation, package mutation, or release action.

## Inputs

- `source_root` — Git working tree used as deployment source
- `installed_root` — installed LConnect directory
- optional `expected_tool_count`
- optional `preserved_paths`
- optional bounds for tracked files, bytes, reported differences and final output

Default preserved paths:

- `mcp-conf.yaml`
- `node_modules`
- `logs`
- `runtime`

## Tracked-file parity

The snapshot obtains the exact source deployment set through:

`git -C <source_root> ls-files -z`

For each tracked path it compares source and installed content using streamed SHA-256 evidence.

Return:

- tracked file count
- equal count
- missing-installed count
- changed count
- unstable/error count
- bounded missing/changed/diagnostic evidence
- source tracked manifest digest
- installed tracked manifest digest
- exact tracked-file parity boolean when evidence is complete

Untracked runtime/config files do not cause tracked parity failure.

## Package/version evidence

Read bounded UTF-8 JSON from source and installed `package.json`.

Return:

- source version
- installed version
- version equality
- source direct dependency declarations
- installed dependency declaration equality
- installed `node_modules/<direct-dependency>/package.json` presence/version evidence

The tool does not perform semver resolution or package installation.

## Preserved local paths

For each requested preserved relative path return:

- exists
- kind (file/directory/other)
- real path when resolvable

The tool does not inspect secret contents.

## Runtime evidence

Reuse the running runtime-catalog snapshot injected by the LConnect host:

- runtime version
- PID
- runtime start
- runtime working directory
- loaded tool count
- catalog digest
- runtime working directory matches installed root
- runtime version matches installed package version
- optional expected tool count match

## Boundaries

- existing allowed-path guard on both roots
- Git command is read-only and bounded
- no shell
- no network
- no mutation
- tracked files are streamed rather than whole-file buffered
- file stability checked around hashing
- symlinks/special entries do not silently count as equal
- bounded file count / bytes / diagnostics / result lists / final JSON output

## Decision boundary

The snapshot reports deterministic evidence and check booleans.

It does **not** decide:

- whether deployment should proceed
- whether restart is required
- whether release is safe
- whether CI/release policy is satisfied

ChatGPT/operator remains workflow and release owner.

## Current evidence

- source catalog: 120 tools
- targeted deployment verification fixture: PASS
- tracked clean/changed/missing cases: PASS
- package/dependency/preserved/runtime evidence: PASS
- expected tool-count match/mismatch: PASS
- bounds/restricted path: PASS
- full local implementation suite before release bump: PASS (~52.6s)
- package/runtime version source-of-truth after v1.2.0 bump: PASS
- post-bump source smoke: PASS (`tools=120`)
- dependency audit: 0 vulnerabilities
- final v1.2.0 release-candidate full suite: PASS (`PASS tools=120`, approximately 53.3 seconds)
- final release-candidate GitHub CI: PENDING
- installed 120-tool live snapshot: PENDING

## Acceptance

- clean tracked source↔installed parity: PASS
- changed tracked file: PASS
- missing installed tracked file: PASS
- untracked preserved paths do not affect tracked parity: PASS
- preserved-path existence/kind evidence: PASS
- source/installed package version parity: PASS
- direct dependency installed presence/version evidence: PASS
- runtime root/version/catalog evidence: PASS
- expected tool-count match/mismatch: PASS
- file stability/resource/output bounds: PASS
- restricted path guard: PASS
- source catalog: 120 tools
- full local suite: PASS
- dependency audit: PASS
- GitHub CI: PASS
- installed live snapshot after restart: PASS
