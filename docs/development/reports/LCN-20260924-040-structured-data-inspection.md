# LCN 2026-09-24 — LCN-040 Structured Data Inspection

## Result

**PASS — STRUCTURED DATA INSPECTION LIVE VALIDATED**

## Goal

Reduce whole-file reads and shell/PowerShell parsing when the task only needs a specific value or structural summary from configuration data.

## Implementation

Added one deterministic read-only tool:

`structured_data_inspect`

Source catalog:

`114 → 115 tools`

Supported formats:

- JSON
- YAML
- TOML

Explicit parser dependencies:

- `yaml@2.9.1`
- `smol-toml@1.9.0`

The dependencies are pinned exactly in `package.json` / `package-lock.json`.

## Query semantics

Selection uses RFC 6901 JSON Pointer.

Examples:

- root: `""`
- nested object: `/server/port`
- array: `/items/0/name`
- key containing `/`: `/labels/a~1b`
- key containing `~`: `/labels/til~0de`

This avoids ambiguous dot-path rules.

## Read/stability contract

The tool:

1. applies the existing real-path access guard
2. opens the file read-only
3. requires a regular file
4. checks the bounded size before reading
5. reads the observed file size
6. verifies size/mtime/ctime stability on the same open handle
7. decodes strict UTF-8
8. parses the selected structured format
9. resolves the JSON Pointer
10. returns bounded metadata and a bounded value preview

If the file changes during the read window, the operation fails rather than parsing an unstable snapshot.

## Bounds

Defaults:

- max file size: 2 MiB
- max depth: 6
- max container items per level: 50
- max string chars: 2000
- max final output chars: 30000

Hard caps:

- max file size: 20 MiB
- max depth: 20
- max container items: 500
- max string chars: 20000
- max output chars: 100000

If the structured preview still exceeds the final output bound, the tool returns valid metadata-only JSON with explicit final-output truncation evidence.

## Diagnostics

Explicit error classes include:

- `FILE_TOO_LARGE`
- `FILE_CHANGED_DURING_READ`
- `ENCODING_ERROR`
- `PARSE_ERROR`
- `INVALID_POINTER`
- `POINTER_NOT_FOUND`

Messages are bounded and do not return the full source file.

## Batch usage

`structured_data_inspect` is allowlisted in `batch_inspect`.

A caller can inspect several independent structured values in one MCP round trip while retaining ordered per-operation evidence.

## Implementation defect found during targeted validation

The first targeted run found a naming mismatch in truncation accounting:

- state field: `container_items`
- increment code: `containerItems`

This caused the intended counter to remain zero and created a non-finite auxiliary value.

The implementation was repaired to use `container_items` consistently.

## Targeted validation

PASS:

- JSON nested pointer
- JSON array pointer
- YAML nested/array pointer
- TOML nested/array pointer
- JSON Pointer `~0` / `~1` escaping
- bounded strings
- bounded container members
- bounded depth
- bounded final output
- invalid pointer diagnostic
- missing node diagnostic
- invalid syntax diagnostic
- file-size bound
- restricted path guard
- explicit format override
- `batch_inspect → structured_data_inspect`
- source smoke: `PASS tools=115`
- syntax check
- dependency audit: 0 vulnerabilities

## Real-file source-candidate validation

The source candidate was exercised against real project/runtime files with narrow JSON Pointers only:

- `LConnect-github/package.json#/name` → `lconnect-mcp`
- installed `mcp-conf.yaml#/health/listen_addr` → `127.0.0.1:18020`

Both auto-detected their formats and returned bounded scalar evidence without reading the full structured document into the response.

## Post-implementation hardening

Before finalizing the task, two additional correctness edges were closed:

1. Final response bounding now has a second metadata-clipping fallback, so an extremely long path/key summary cannot itself defeat `max_output_chars`.
2. Non-finite numeric values supported by TOML (`NaN`, `+Infinity`, `-Infinity`) are represented explicitly as `{ "$number": "..." }` instead of being silently converted to JSON `null`.

Targeted regression for both cases: **PASS**.

A final security/correctness review also removed truncation sentinels from user object namespaces and builds object previews with a null prototype. This preserves literal keys such as `__proto__` and `$truncated` without prototype-setter behavior or collision with LConnect metadata. Targeted regression: **PASS**.

The initial implementation CI run `35987712170` corresponds to commit `9e395d0c56aa89f33409edf681dcc8ec322be8c5` before this hardening and is therefore not the final candidate CI.

## Full validation

Final frozen full local suite: **PASS** (`PASS tools=115`, approximately 43.5 seconds)

Base implementation commit: `9e395d0c56aa89f33409edf681dcc8ec322be8c5` — CI `35987712170` PASS

Bounds/numeric hardening: `ff04cc0b1fee9d1c0b47cdf79e8c255b8c5f89e2` — CI `35988193442` PASS

Final frozen candidate: `597ce9f8454158858d3085ed086adf006fd7789d`

GitHub Actions: **PASS** — run `35988530743`

## Pre-restart installed deployment evidence

Tracked source was synchronized to the installed runtime and the two parser dependencies were added without removing the existing `node_modules` tree.

Installed validation:

- dependency versions: `yaml@2.9.1`, `smol-toml@1.9.0`
- syntax check: PASS
- structured-data smoke: PASS
- source smoke: `PASS tools=115`
- source/install `modules/structured-data-inspection.mjs` SHA-256 parity: PASS
- module digest: `ff4157f67c5f64f41a8148fdf2d906977d0a3ea16cef2262fa09a987cc4f4646`

The active daemon before restart remained the previous catalog:

- process ID: `37256`
- runtime start: `2026-09-24T10:20:26.195Z`
- tool count: 114
- catalog digest: `5e9102835c1cb8012140315651e840d51453cfee66e9373d1d0539014318dc0e`

Therefore the installed files/dependencies are ready at 115 tools while one restart/reconnect is required to activate the new tool in the running process.

## Restarted installed live validation

After restart/reconnect, `batch_inspect` observed:

- process ID: `38268`
- runtime start: `2026-09-24T11:00:05.481Z`
- runtime tool count: 115
- runtime catalog digest: `cd018b4780f6ed2d3138b92e28037cdeb3ba64ab3df1a9a81a74478d22b67447`
- ChatGPT-visible direct catalog at that moment: 114
- direct `structured_data_inspect`: not yet visible
- `batch_inspect → structured_data_inspect`: PASS

Live installed reads:

- `package.json#/name` → `lconnect-mcp`
- `mcp-conf.yaml#/health/listen_addr` → `127.0.0.1:18020`

The three-operation live batch (`runtime_catalog` + JSON + YAML) completed in approximately 6.1 ms inner handler time.

## Final result

**PASS — STRUCTURED DATA INSPECTION LIVE VALIDATED**
