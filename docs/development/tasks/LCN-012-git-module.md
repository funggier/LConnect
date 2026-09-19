# LCN-012 — Git Module

Status: **ACTIVE**

## Goal

ทำ repository workflow เป็น structured contract

## Planned capabilities

git_status, git_diff, git_log, git_branch, git_commit, git_fetch, git_pull, git_push, git_worktree

## Design notes

ใช้ machine-readable Git formats; mutations ต้องคืน exact SHA/ref

## Progress

- 2026-09-19: Started from coordination HEAD `a38f11cb843464b16dd47dcd905a8359b2aa12ab`.
- RED established: smoke catalog expected nine Git tools and failed because implementation was absent.
- Added `modules/git.mjs` and `tests/git-smoke.mjs`.
- Repository path is explicit for every tool.
- Read operations use stable Git porcelain/ref formats.
- Mutations do not use force by default; force push is intentionally unsupported.
- Commit staging behavior is explicit.
- Integration tests use disposable local repositories and a local bare remote; no real remote repository is mutated.
- Test harness caught and fixed two fixture defects before production validation: missing MCP client connect and bare-remote HEAD still pointing to master.
- Local integration PASS: status, bounded diff, structured log, branch create/switch/list, commit exact SHA, push, fetch, ff-only pull, worktree add/list/remove.
- Local catalog: 63 tools.
- `npm run check`: PASS.
- `npm test`: PASS.
- `npm audit --audit-level=moderate`: 0 vulnerabilities.

## Acceptance criteria

- capability ถูก register ผ่าน MCP และมี structured schema
- output bounded และ error preserve root cause
- tests ครอบคลุม happy path + failure path ที่สำคัญ
- existing tools ไม่ regression
- documentation อัปเดต
- npm check/test/audit และ GitHub CI PASS
- บันทึก exact commit SHA, changed files, runtime evidence และ follow-up tasks ตอนปิดงาน

## Scope rule

ถ้าพบ adjacent work ที่แยกได้ ให้สร้าง numbered task ใหม่แทนการขยาย task นี้ไม่สิ้นสุด