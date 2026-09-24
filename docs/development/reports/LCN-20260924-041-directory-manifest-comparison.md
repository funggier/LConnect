# LCN 2026-09-24 — LCN-041 Directory Manifest and Comparison

## Result

**IMPLEMENTATION GREEN — INSTALLED LIVE VALIDATION PENDING**

## Goal

Reduce repeated per-file hashing and shell-based tree comparison during deployment/source verification.

LCN-041 adds two deterministic read-only primitives:

- `directory_manifest`
- `compare_directories`

Source catalog:

`115 → 117 tools`

## Directory manifest contract

`directory_manifest` recursively enumerates selected regular files under one root and returns:

- requested/resolved root evidence
- algorithm
- deterministic selected file count / selected byte count
- manifest digest
- bounded per-file relative-path/size/digest evidence
- diagnostics
- completeness / truncation evidence

The manifest digest is derived from sorted records containing:

- relative path
- file size
- file digest

Timestamps are not part of content equality.

## Directory comparison contract

`compare_directories` builds equivalent manifests for two roots and compares relative paths.

It reports:

- `equal`
- `comparison_reliable`
- common/equal file count
- changed file count
- left-only paths
- right-only paths
- changed size/digest evidence
- left/right manifest digests
- bounded diagnostics

If either side is incomplete or unstable:

- `comparison_reliable=false`
- `equal=null`

The tool does not claim equality from partial evidence.

## Selection

Both tools support:

- `include_patterns`
- `exclude_patterns`

They reuse LConnect's existing relative-path glob semantics.

## Streaming and stability

Files are hashed through streams.

For each selected file the implementation checks:

- open-handle type
- open-handle size against `max_file_bytes`
- open-handle size against remaining `max_total_bytes` budget
- bytes actually hashed
- size/mtime/ctime stability on the open handle
- path identity after hashing

The file-size/remaining-total-byte checks occur on the open handle immediately before streaming. This prevents a file that grows after candidate enumeration from bypassing the resource bound.

## Directory stability

Each traversed directory is statted before and after recursive processing.

Observable identity/timestamp changes cause:

- `complete=false`
- an explicit diagnostic

This does not claim perfect filesystem transaction semantics, but it prevents many concurrent tree mutations from being silently treated as a stable complete snapshot.

## Symlink / junction policy

Symbolic links and junctions are not followed.

Observed local validation:

- ordinary file symlink creation: unsupported in this Windows environment, regression skipped
- Windows junction creation: supported
- junction was detected as a symbolic-link-style directory entry and skipped
- `SYMLINK_SKIPPED` diagnostic: PASS
- manifest completeness became false as designed

## Bounds

Defaults:

- max files: 500
- max file bytes: 100 MiB
- max total bytes: 500 MiB
- max walk entries: 10000
- max diagnostics: 100
- max reported entries: 200
- max output chars: 60000

Hard caps prevent unbounded scans.

## Output bound

Large manifest/difference details are bounded.

If the final serialized response would exceed `max_output_chars`, detailed entries are omitted and compact aggregate evidence is returned.

## Batch usage

Both tools are allowlisted in `batch_inspect`.

Targeted batch validation against the repository's real `modules` directory:

- `directory_manifest`: PASS
- `compare_directories(modules, modules)`: PASS
- same-tree equality reliable: true

## Targeted validation

PASS:

- deterministic manifest digest
- include/exclude patterns
- same-tree equality
- changed file detection
- left-only / right-only detection
- same-size content change detection
- empty directory manifest/comparison
- max file bytes
- max total bytes
- max files
- max walk entries
- incomplete comparison returns `equal=null`
- output bound
- restricted path guard
- Windows junction skip/diagnostic
- batch visibility
- syntax check
- source smoke: `PASS tools=117`
- dependency audit: 0 vulnerabilities

Conditional:

- ordinary file symlink regression: SKIP because symlink creation is unsupported by the current local Windows account/environment

## Final hardening

Before freezing the implementation:

1. file-size and remaining-total-byte bounds were moved onto the open file handle immediately before streaming, closing the enumeration→open growth race for resource limits;
2. manifest and comparison ordering now uses a locale-independent code-unit comparator rather than `localeCompare`, so the digest order does not depend on machine locale;
3. final output bounding now has a second compact metadata fallback so long roots/metadata cannot defeat `max_output_chars`.

Targeted regression after hardening: **PASS**.

## Real source↔installed pre-deploy validation

The source candidate was executed directly against:

- left: `LConnect-github/modules`
- right: `tunnel-mcp-ok/modules`

Before deployment it reported:

- comparison reliable: true
- left files: 28
- right files: 27
- common equal files: 26
- changed files: 1
- source-only files: 1
- installed-only files: 0
- source-only: `directory-integrity.mjs`
- changed: `batch-inspect.mjs`

This exactly matched the expected LCN-041 pre-deploy drift and demonstrates the intended deployment-verification use case.

## Full validation

Final frozen full local suite: **PASS** (`PASS tools=117`, approximately 44.6 seconds)

Implementation commit: `07769a29c22b27d431cbfe159042e2ffad958c12`

GitHub Actions: **PASS** — run `35991690293`

## Pre-restart installed deployment evidence

Tracked source was synchronized to the installed runtime.

Installed validation:

- syntax check: PASS
- directory-integrity smoke: PASS
- source smoke: `PASS tools=117`
- source/install `modules/directory-integrity.mjs` SHA-256 parity: PASS
- module digest: `b997cf9f72185b2ee144c1afb3c896c21f45165a42686601ea42984eab222429`

A post-deploy tree-level comparison using the LCN-041 candidate reported:

- comparison reliable: true
- source modules: 28 files
- installed modules: 28 files
- common equal files: 28
- changed files: 0
- source-only files: 0
- installed-only files: 0
- left/right manifest digest: `b3292291420777e3f376b8a14361a3ed2576209216279b02624935bc80c24f96`

The active daemon before restart remained the prior catalog:

- process ID: `38268`
- runtime start: `2026-09-24T11:00:05.481Z`
- tool count: 115
- catalog digest: `cd018b4780f6ed2d3138b92e28037cdeb3ba64ab3df1a9a81a74478d22b67447`

Therefore installed files are ready at 117 tools while one restart/reconnect is required to activate the two new tools in the running process.

Restarted installed live validation: **PENDING**
