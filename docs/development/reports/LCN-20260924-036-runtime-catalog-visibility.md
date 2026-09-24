# LCN 2026-09-24 — LCN-036 Runtime Catalog Visibility / Refresh Evidence

## Result

**IMPLEMENTATION GREEN — LIVE DEPLOY VALIDATION PENDING**

## Goal

Make the catalog loaded by the running LConnect process directly observable so runtime deployment can be distinguished from a stale ChatGPT-visible plugin catalog.

## Incident basis

LCN-035 established a reproducible split:

- installed/runtime daemon: 112 tools
- ChatGPT-visible catalog without plugin refresh: 111 tools
- new `session_status` behavior executed server-side through `batch_inspect`
- explicit ChatGPT plugin refresh then exposed 112 tools and `session_status` directly

Daemon restart and ChatGPT plugin/catalog refresh are therefore separate lifecycle events.

## Implementation

Added:

- `runtime_catalog`
- `modules/runtime-catalog.mjs`
- `tests/runtime-catalog-smoke.mjs`

Source catalog:

`112 → 113 tools`

The catalog tracker wraps tool registration in-process and records tool names only.

## runtime_catalog contract

Default evidence:

- LConnect version
- process ID
- runtime start time
- working directory
- catalog ready state
- registered tool count
- SHA-256 digest of sorted registered tool names

Optional:

- sorted tool names with `include_names=true`

The default response is intentionally compact.

The digest is computed from:

```text
sorted tool name 1
sorted tool name 2
...
```

No arguments, input schemas, credential values, environment values, file contents or result contents are included.

## Startup evidence

The normal LConnect startup stderr line now also reports:

- runtime tool count
- runtime catalog digest

This provides evidence even before a tool call is available.

## Stale-client recovery

`runtime_catalog` is included in the existing read-only `batch_inspect` allowlist.

This is intentional.

If ChatGPT still exposes an older schema that already knows `batch_inspect`, it can submit:

```text
batch_inspect
  operation.tool = runtime_catalog
```

The restarted server can then report its actual catalog count/digest even when the client has not yet discovered `runtime_catalog` as a direct tool.

This converts the LCN-035 workaround into an explicit supported diagnostic contract.

## Targeted validation

- registered-tool tracking: PASS
- count includes `runtime_catalog`: PASS
- compact process/runtime identity: PASS
- stable SHA-256 digest: PASS
- optional sorted names: PASS
- `batch_inspect → runtime_catalog`: PASS
- source smoke: `PASS tools=113`
- syntax check: PASS
- dependency audit: 0 vulnerabilities

An early targeted run found and repaired one implementation defect in `markReady()`: it referenced a non-lexical `snapshot` method. The implementation now uses one shared internal `buildSnapshot()` function for direct tool responses, `markReady()` and programmatic snapshots.

## Full validation

Full local suite: **PASS** (`PASS tools=113`, approximately 43.9 seconds)

GitHub Actions: **PASS** — run `35978697107`

## Architecture

`runtime_catalog` is observation only.

It does not:

- force ChatGPT plugin refresh
- modify tunnel-client discovery
- retry catalog discovery
- create another MCP channel
- persist workflow state
- own decisions about restarting/reconnecting

The external AI/user remains responsible for deciding whether a plugin refresh is required.
