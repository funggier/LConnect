# LCN-040 — Structured Data Inspection

Status: **COMPLETE — LIVE VALIDATED**

## Goal

Reduce repeated whole-file reads and shell/PowerShell parsing for structured configuration files by adding one deterministic read-only inspection primitive.

## Tool

`structured_data_inspect`

Supported formats:

- JSON
- YAML
- TOML

Format can be auto-detected from extension or selected explicitly.

## Query contract

Use JSON Pointer semantics for selecting a node:

- root: empty pointer `""`
- object key: `/server/port`
- array index: `/items/0/name`
- escaping: `~0` for `~`, `~1` for `/`

This avoids ambiguous dot-path parsing.

## Output

Return bounded structured evidence:

- requested/resolved path
- format
- file size
- selected pointer
- selected node type
- object key count / array length where applicable
- sorted object keys (bounded)
- selected value preview (bounded)
- truncation metadata
- parse diagnostics on failure

## Bounds

- existing real-path guard
- regular file only
- default max file size: 2 MiB
- hard max file size: 20 MiB
- bounded recursion depth
- bounded object/array members per level
- bounded string length
- bounded final output chars

No mutation is performed.

## Dependencies

Use explicit parser dependencies rather than implementing incomplete parsers:

- `yaml@2.9.1`
- `smol-toml@1.9.0`

These are parser-only dependencies for deterministic local inspection.

## Batch usage

Add `structured_data_inspect` to the read-only `batch_inspect` allowlist.

This allows several independent config queries to be returned in one MCP round trip.

## Non-goals

- schema validation
- config mutation
- merge/patch semantics
- arbitrary JSONPath/JMESPath execution
- template/env expansion
- automatic secret classification

## Current evidence

- source catalog: 115 tools
- parser dependencies: `yaml@2.9.1`, `smol-toml@1.9.0`
- targeted JSON/YAML/TOML tests: PASS
- pointer/array/escape tests: PASS
- bounds/diagnostics/path guard: PASS
- TOML non-finite numeric fidelity: PASS
- prototype/reserved-key preservation (`__proto__`, `$truncated`): PASS
- batch visibility: PASS
- source smoke: PASS (`tools=115`)
- syntax check: PASS
- dependency audit: 0 vulnerabilities
- final frozen full local suite: PASS (`PASS tools=115`, approximately 43.5 seconds)
- real-file source-candidate check: PASS (`package.json#/name`, `mcp-conf.yaml#/health/listen_addr`)
- base implementation: `9e395d0c56aa89f33409edf681dcc8ec322be8c5` — CI `35987712170` PASS
- bounds/numeric hardening: `ff04cc0b1fee9d1c0b47cdf79e8c255b8c5f89e2` — CI `35988193442` PASS
- final frozen candidate: `597ce9f8454158858d3085ed086adf006fd7789d`
- GitHub CI: `35988530743` — PASS
- installed source/dependencies: PASS (`tools=115`, `yaml@2.9.1`, `smol-toml@1.9.0`)
- source/install module SHA-256 parity: PASS (`ff4157f67c5f64f41a8148fdf2d906977d0a3ea16cef2262fa09a987cc4f4646`)
- pre-restart daemon: 114 tools, PID 37256, digest `5e9102835c1cb8012140315651e840d51453cfee66e9373d1d0539014318dc0e`
- restarted runtime: PASS (115 tools, PID 38268, digest `cd018b4780f6ed2d3138b92e28037cdeb3ba64ab3df1a9a81a74478d22b67447`)
- live `batch_inspect → structured_data_inspect`: PASS
- live JSON pointer `/name`: `lconnect-mcp`
- live YAML pointer `/health/listen_addr`: `127.0.0.1:18020`

## Acceptance

- JSON root and nested pointer: PASS
- YAML nested pointer: PASS
- TOML nested pointer: PASS
- arrays and escaped pointer segments: PASS
- invalid pointer: explicit error
- invalid syntax: explicit bounded diagnostic
- file-size bound: PASS
- restricted resolved-path guard: PASS
- bounded strings/containers/depth/output: PASS
- batch visibility: PASS
- full npm check/test/audit: PASS
- GitHub CI: PASS
- installed live validation: PASS
