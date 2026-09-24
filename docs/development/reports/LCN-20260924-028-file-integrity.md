# LCN 2026-09-24 — LCN-028 File Integrity

## Result

**PASS — FILE INTEGRITY PRIMITIVES GREEN**

## Goal

Add structured file digest/parity primitives for deployment, release and recovery evidence without requiring PowerShell \`Get-FileHash\` or whole-file buffering.

## Implementation

Implementation commit:

\`f813bda063efde3efe4f278cfd4cd357d60744bc\`

Added:

- \`file_hash\`
- \`compare_files\`
- \`modules/file-integrity.mjs\`
- \`tests/file-integrity-smoke.mjs\`

Catalog:

\`99 → 101 tools\`

## Hash contract

\`file_hash\` returns:

- requested path
- resolved path
- algorithm
- file size
- bytes hashed
- hexadecimal digest
- modified time
- before/after stability evidence

Default algorithm:

\`SHA-256\`

Supported algorithms:

- SHA-256
- SHA-384
- SHA-512

No weak digest is offered by the first contract.

## Streaming / memory behavior

Files are hashed through a bounded 1 MiB stream chunk.

The implementation does not read the entire file into memory.

The large-file acceptance fixture hashes a 4 MiB file and verifies that all bytes were streamed into the digest.

## Stability evidence

The implementation records:

- size before hashing
- modified/change timestamps before hashing
- size/timestamps from the still-open file handle after hashing
- path identity after hashing where the platform exposes device/inode identity
- bytes actually hashed

\`stable_observed\` is true only when the observable before/after evidence remains consistent.

The result explicitly states the remaining uncertainty: metadata comparison cannot prove the absence of an in-place same-size mutation that preserves all observable metadata.

## compare_files

\`compare_files\` hashes both files with the same cryptographic algorithm and returns:

- \`equal\`
- \`size_equal\`
- \`digest_equal\`
- \`comparison_reliable\`
- uncertainty text when either side lacks stable evidence
- full left/right hash evidence

Same-size files with different contents are correctly reported unequal.

## Filesystem / link semantics

The LCN-027 shared existing-path guard is reused.

An explicitly supplied symlink/reparse path is resolved to its real target before hashing. In restricted mode the resolved target must still remain inside an allowed root.

Only regular files are accepted.

## Batch integration

Both tools are deterministic local read operations and were added to the bounded read-only \`batch_inspect\` allowlist.

No mutation or workflow behavior was introduced.

## Validation

Targeted acceptance:

- known SHA-256 digest: PASS
- empty file: PASS
- 4 MiB streaming file: PASS
- source/installed equal fixture: PASS
- unequal files: PASS
- same-size unequal files: PASS
- non-file explicit error: PASS
- restricted filesystem path rejection: PASS

Local:

- \`npm run check\`: PASS
- full \`npm test\`: PASS
- source smoke: \`PASS tools=101\`
- dependency audit: \`0 vulnerabilities\`

GitHub Actions:

- run: \`35964536298\`
- result: **PASS**
- Windows runtime smoke tests: **PASS**
- dependency audit: **PASS**

## Architecture

These capabilities remain observation/evidence primitives. They do not decide whether a deployment is safe or whether a release should proceed; the external AI/workflow owns that decision.

## Follow-up

LCN-029 Exact Git Ref / Ancestry Safety is next.
