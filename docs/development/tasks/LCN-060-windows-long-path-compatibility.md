# LCN-060 — Windows Long Path Compatibility Hardening

Status: **COMPLETE / DEPLOYED / LIVE GREEN**

Activated: 2026-10-13

## Goal

Eliminate the confirmed Git-for-Windows MAX_PATH failure mode from LConnect-managed Git operations without requiring a global Git configuration change or modifying immutable release evidence.

## Authoritative baseline

- repository: `funggier/LConnect`
- branch: `main`
- activation HEAD: `b3c0af02eda8a0bf44f822ddeb4a3b7a7c6a953b`
- source version: 1.3.1
- live runtime: 1.3.1 / 154 tools
- live catalog digest: `2ca33225b970dd70e1350d7b4e3d9290116448181031872d643111ae7ab4c374`
- Windows `LongPathsEnabled`: 1
- repository `core.longpaths`: unset at activation
- activation worktree: clean; `main == origin/main`

## Triggering evidence

A disposable physical probe reproduced the problem:

1. LConnect filesystem successfully created and inspected a file whose absolute path length was 418 characters.
2. Git for Windows, with `core.longpaths` unset, emitted `Filename too long` while traversing the same tree.
3. Re-running Git with `core.longpaths=true` successfully staged the complete long path.

This isolates the confirmed defect to the Git-for-Windows invocation layer rather than the LConnect Node filesystem layer.

## Scope

- make all Git commands issued by `modules/git.mjs` use a per-process `core.longpaths=true` override on Windows
- do not mutate global/system/repository Git configuration
- preserve non-Windows behavior
- add a Windows regression using an absolute path greater than 260 characters
- prove `git_status` observes the deep file and `git_commit` can commit it
- prove a repository-local `core.longpaths=false` value is not mutated by LConnect
- keep the public MCP catalog unchanged at 154 tools

## Non-goals

- no movement or overwrite of v1.3.1, v1.3.0 or v1.2.2 tags/releases
- no force push
- no reset/clean of the worktree
- no machine-wide Git configuration mutation
- no automatic registry mutation
- no claim that legacy third-party executables outside LConnect/Git become long-path aware

## Qualification required before closure

- targeted long-path regression
- existing Git smoke suites
- `npm run check`
- full `npm test`
- `npm audit --audit-level=high`
- `git diff --check`
- exact-commit GitHub CI
- tracked-only deployment preserving local state
- secure runtime restart because `modules/git.mjs` changes
- live runtime catalog remains 1.3.1 / 154 tools with no duplicates
- installed physical long-path Git acceptance
- source/install tracked parity

## Closure evidence

- implementation commit: `1f6bf8b721631bd7fefb1d74eb99c2ade02aea40`
- exact-commit CI: #184 / run `38284363602` — SUCCESS
- local qualification: syntax 85 files PASS; 40 Node + 2 PowerShell suites PASS; npm audit 0 vulnerabilities
- installed long-path regression: PASS at 347-character absolute path
- secure detached restart: PASS; live runtime 1.3.1 / 154 tools / PID 14132 at qualification
- live connector physical acceptance: PASS at 387-character absolute path with repository-local `core.longpaths=false`
- live physical commit: `fcc5b4f3fc19e949f55fe360ec0e08cf3f71e62b`
- repository-local `core.longpaths=false` remained unchanged
- deployed source/install parity: 264/264 exact; manifest digest `51f1bbec79880f5ca9de92b353c2a58eee50ddea9fc484999a2b513d76d1dab5`
- encrypted credential hash preserved; default `\\LConnect Autostart` remained absent
- report: `../reports/LCN-20261013-060-windows-long-path-compatibility.md`
