# LCN-027 — Structured Text Search

Status: **READY**

## Goal

เพิ่ม `search_text` เพื่อค้น content ใน source/config/text files แบบ structured โดยไม่ต้องใช้ PowerShell/rg สำหรับ common case

## Why

`search_files` ค้น path/name ได้ แต่ diagnosis และ code archaeology ต้องค้น symbol/error/config key ในเนื้อหาไฟล์บ่อยมาก

## Planned capability

- `search_text`

## Required behavior

- literal and regex modes
- case-sensitive option
- include/exclude file patterns
- context lines
- path + line + column evidence
- Unicode/Thai safe
- binary skip/report
- bounded files/bytes/matches
- truncation metadata
- per-file read/encoding errors visible
- filesystem scope enforced

## Dependency rule

External `rg` may be used as an optional optimization only if LConnect preserves a dependency-free baseline or provides a deterministic fallback.

## Tests

- literal
- regex
- Unicode/Thai
- case modes
- include/exclude patterns
- context
- binary file
- large tree bounds
- restricted path

## Acceptance criteria

- common source search no longer requires raw shell
- output stable and bounded
- no mutation
- npm check/test/audit PASS
- direct MCP runtime acceptance PASS
- GitHub CI PASS
- docs/status/report updated

## Scope rule

This task is content search only. AST/symbol indexing and semantic code search are separate future concerns.
