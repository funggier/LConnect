# LCN-036 — Runtime Catalog Visibility / Refresh Evidence

Status: **ACTIVE — IMPLEMENTATION GREEN / LIVE VALIDATION PENDING**

## Goal

Make runtime MCP catalog state observable from LConnect itself so a daemon/source update can be distinguished from a stale ChatGPT-visible plugin catalog without repeated restart/reconnect guessing.

## Incident basis

LCN-035 live validation established:

- installed/runtime source smoke: 112 tools
- restarted daemon executed the new `session_status` behavior
- ChatGPT-visible catalog remained at 111 tools until the user explicitly refreshed the plugin
- after plugin refresh, ChatGPT-visible catalog became 112 and exposed `session_status` directly

Therefore daemon restart and ChatGPT plugin/catalog refresh are separate lifecycle events.

## Changes

Add read-only tool:

`runtime_catalog`

Default result:

- process ID
- runtime start time
- working directory
- LConnect version
- registered tool count
- stable SHA-256 digest of sorted registered tool names
- catalog ready flag

Optional:

- include sorted tool names

The tool must not expose arguments, schemas, credentials, configuration secrets or user file data.

## Stale-catalog recovery contract

`runtime_catalog` is added to the existing `batch_inspect` read-only allowlist.

This means an older ChatGPT-visible schema that already knows `batch_inspect` can still ask the newly restarted server to execute `runtime_catalog` by name and compare server-side count/digest with the client-visible catalog.

## Non-goals

- forcing ChatGPT to refresh its plugin schema
- modifying tunnel-client discovery behavior
- adding a second MCP channel
- autonomous refresh/retry loops
- changing OpenAI control-plane behavior

## Current evidence

- implementation: `fea6ba11af78b4a5ba1b8bc5c4437d9b5706c003`
- source catalog: 113 tools
- targeted runtime-catalog/batch tests: PASS
- full local suite: PASS
- dependency audit: 0 vulnerabilities
- GitHub Actions: `35978697107` — PASS
- live deployment validation: PENDING

## Acceptance

- server tracks every registered tool name once
- `runtime_catalog` count includes itself
- digest is stable for the same sorted catalog
- default output is compact
- optional names output is bounded by actual registered catalog
- process/runtime identity evidence is present
- available through `batch_inspect`
- full npm check/test/audit PASS
- GitHub CI PASS
- live no-refresh/refresh behavior documented
