# LCN-040 — Structured Data Inspection

Status: **ACTIVE — IMPLEMENTATION GREEN / CI PENDING**

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
- batch visibility: PASS
- source smoke: PASS (`tools=115`)
- syntax check: PASS
- dependency audit: 0 vulnerabilities
- full local suite: PASS (`PASS tools=115`, approximately 44.7 seconds)
- GitHub CI: PENDING
- installed live validation: PENDING

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
