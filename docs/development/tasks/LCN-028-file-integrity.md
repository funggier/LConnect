# LCN-028 — File Integrity

Status: **COMPLETE**

## Goal

เพิ่ม structured file digest/parity primitives สำหรับ deployment, release และ recovery evidence

## Why

งานจริงต้องเปรียบเทียบ source/installed และ verify downloaded artifacts ซ้ำบ่อย ปัจจุบันต้องเรียก `Get-FileHash` ผ่าน PowerShell

## Planned capabilities

- `file_hash`
- `compare_files`

## Required behavior

### file_hash

Return:

- path
- algorithm
- size
- digest
- modified time

Default algorithm: SHA-256

### compare_files

Return:

- equal
- size_equal
- digest_equal
- left evidence
- right evidence

## Safety/performance

- stream large files
- do not read entire file into memory
- filesystem scope enforced
- missing/non-file path errors explicit
- symlink/reparse semantics documented
- no weak digest as default
- report uncertainty if file mutation during hashing can be detected

## Tests

- known digest
- empty file
- large file
- equal files
- unequal files
- same-size unequal files
- source/installed fixture
- restricted path

## Acceptance criteria

- SHA-256 evidence deterministic
- large files remain bounded in memory
- npm check/test/audit PASS
- direct MCP runtime acceptance PASS
- GitHub CI PASS
- docs/status/report updated

## Completion evidence

- implementation: `f813bda063efde3efe4f278cfd4cd357d60744bc`
- source catalog: 101 tools
- targeted acceptance: PASS
- full local suite: PASS
- dependency audit: 0 vulnerabilities
- GitHub Actions: `35964536298` — PASS
- report: `../reports/LCN-20260924-028-file-integrity.md`

## Scope rule

Archive signing, code signing and certificate validation are not part of this task.
