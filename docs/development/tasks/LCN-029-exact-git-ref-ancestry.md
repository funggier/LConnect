# LCN-029 — Exact Git Ref / Ancestry Safety

Status: **PLANNED**

## Goal

เติม Git primitives ที่จำเป็นต่อ release/coordination flow โดยรักษา exact identity และ non-force safety contract

## Why

Git module ปัจจุบันครอบคลุม common branch workflow แต่ exact release flow ยังต้องใช้ raw commands เช่น `git ls-remote`, `git merge-base --is-ancestor` และ `git push <sha>:<ref>`

## Planned capabilities

Minimum set:

- `git_remote_ref`
- `git_is_ancestor`
- `git_push_ref`

## Required behavior

### git_remote_ref

- exact remote + full ref
- returns resolved SHA
- read-only

### git_is_ancestor

- resolve both commit-ish values
- return exact SHAs + boolean

### git_push_ref

- explicit source
- explicit full destination ref
- default/required fast-forward safety for branch mutation
- return remote SHA before/after
- no force option in first contract
- reject ambiguous source/destination

## Safety

- preserve existing `git_push`
- no wildcard destructive ref
- no force push
- no implicit branch switching
- no tag rewrite support in first version

## Tests

Use disposable local repository + bare remote:

- remote ref lookup
- ancestor true/false
- exact SHA fast-forward
- non-fast-forward rejection
- invalid ref rejection
- before/after remote evidence

## Acceptance criteria

- common exact-SHA release ref workflow no longer requires raw Git
- safety contract documented
- npm check/test/audit PASS
- direct MCP runtime acceptance PASS
- GitHub CI PASS
- docs/status/report updated

## Scope rule

Branch protection administration, signing and tag mutation are outside this task.
