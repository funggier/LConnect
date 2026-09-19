# LCN-012 — Git Module

Status: **READY**

## Goal

ทำ repository workflow เป็น structured contract

## Planned capabilities

git_status, git_diff, git_log, git_branch, git_commit, git_fetch, git_pull, git_push, git_worktree

## Design notes

ใช้ machine-readable Git formats; mutations ต้องคืน exact SHA/ref

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