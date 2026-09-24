# LCN-041 — Directory Manifest and Comparison

Status: **COMPLETE — LIVE VALIDATED**

## Goal

Reduce repeated per-file hashing and shell-based tree comparison during deployment/source verification.

Recent deployment validation repeatedly needed to answer:

- do source and installed trees contain the same relevant files?
- which relative paths are missing, extra, or changed?
- can the whole selected tree be represented by one deterministic digest?

## Tools

### `directory_manifest`

Recursively enumerate selected regular files under one root, stream-hash them, and return:

- root evidence
- algorithm
- deterministic selected-file count / total bytes
- manifest digest
- bounded per-file entries
- diagnostics / skipped counts
- completeness / reliability evidence

The manifest digest is computed from sorted relative-path + size + file-digest records, not from timestamps.

### `compare_directories`

Build equivalent bounded manifests for two roots and compare by relative path.

Return:

- equal
- comparison_reliable
- common/equal/changed counts
- left-only paths
- right-only paths
- changed paths with size/digest evidence
- left/right manifest digests
- truncation/diagnostic evidence

## Selection

Shared filters:

- `include_patterns`
- `exclude_patterns`

Patterns use LConnect's existing relative-path glob semantics.

## Safety / correctness contract

- existing real-path access guard
- root must be a directory
- recursive walk only through real directory entries
- symbolic links / junctions are skipped and diagnosed
- files are stream-hashed
- per-file stability evidence is checked while hashing
- deterministic relative-path ordering
- no mutation
- no shell dependency

## Bounds

Defaults:

- max files: 500
- max file bytes: 100 MiB
- max total bytes: 500 MiB
- max diagnostics: 100
- max reported entries/differences: 200
- max output chars: 60000

Hard caps prevent accidental unbounded scans.

If bounds or diagnostics prevent a complete trustworthy view:

- `complete=false`
- `comparison_reliable=false`
- `equal` must not be reported as confidently true

## Batch usage

Both tools are read-only and may be allowlisted in `batch_inspect`.

## Non-goals

- file synchronization/copy
- deletion
- permission/ACL comparison
- timestamp equality as content equality
- following symlinks/junctions
- semantic structured-file comparison

## Current evidence

- source catalog: 117 tools
- deterministic manifest/filter/empty tree: PASS
- changed/missing/extra detection: PASS
- same-size content change: PASS
- bounds and `equal=null` on incomplete evidence: PASS
- Windows junction skip/diagnostic: PASS
- ordinary file symlink creation: unsupported locally; conditional regression skipped
- batch visibility: PASS
- source smoke: PASS (`tools=117`)
- syntax check: PASS
- dependency audit: 0 vulnerabilities
- final frozen full local suite: PASS (`PASS tools=117`, approximately 44.6 seconds)
- implementation: `07769a29c22b27d431cbfe159042e2ffad958c12`
- GitHub CI: `35991690293` — PASS
- real source↔installed pre-deploy comparison: PASS (reliable; 26 equal, 1 changed, 1 source-only)
- installed source validation: PASS (`PASS tools=117`, directory-integrity smoke PASS)
- source/install module file SHA-256 parity: PASS (`b997cf9f72185b2ee144c1afb3c896c21f45165a42686601ea42984eab222429`)
- post-deploy source↔installed `modules` tree comparison: PASS (28/28 equal; manifest digest `b3292291420777e3f376b8a14361a3ed2576209216279b02624935bc80c24f96`)
- pre-restart daemon: 115 tools, PID 38268, digest `cd018b4780f6ed2d3138b92e28037cdeb3ba64ab3df1a9a81a74478d22b67447`
- restarted runtime: PASS (117 tools, PID 38572, digest `b44e9a4acdf1c83e7243d5374ca1c9c4629205fc30fb305419764251ebdc416e`)
- live `batch_inspect → directory_manifest`: PASS (28 files, complete=true)
- live source↔installed `compare_directories`: PASS (reliable + equal=true; changed/missing/extra=0)
- live source/install manifest digest: `b3292291420777e3f376b8a14361a3ed2576209216279b02624935bc80c24f96`

## Acceptance

- deterministic manifest digest: PASS
- include/exclude patterns: PASS
- same-tree comparison: PASS
- changed file detection: PASS
- left-only/right-only detection: PASS
- same-size content change detection: PASS
- empty directory: PASS
- symlink skip/diagnostic where supported: PASS
- file/total-byte/file-count bounds: PASS
- restricted path guard: PASS
- unstable/incomplete evidence cannot produce reliable equality: PASS
- batch visibility: PASS
- source smoke catalog: PASS
- full local suite: PASS
- dependency audit: PASS
- GitHub CI: PASS
- installed live validation: PASS
