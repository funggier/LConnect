# LCN-060 — Windows Long Path Compatibility Hardening

Date: 2026-10-13

Status: **COMPLETE / DEPLOYED / LIVE GREEN**

## Summary

LCN-060 removes the confirmed Git-for-Windows legacy MAX_PATH failure from every Git operation issued through LConnect while preserving repository/global Git configuration.

Windows LConnect Git invocations now prepend a process-scoped `-c core.longpaths=true`. Non-Windows invocation behavior is unchanged. No public MCP tool was added or removed; the catalog remains 154 tools.

## Trigger and root cause

Activation evidence isolated the failure to Git for Windows:

- Windows `LongPathsEnabled=1` was already enabled.
- LConnect filesystem successfully created/read a 418-character absolute path.
- Git with `core.longpaths` unset emitted `Filename too long` on the same deep tree.
- Git succeeded after enabling `core.longpaths=true`.

Therefore the repair belongs at the LConnect Git invocation boundary rather than in filesystem access or registry configuration.

## Implementation

Implementation commit:

`1f6bf8b721631bd7fefb1d74eb99c2ade02aea40`

Changed Git execution in `modules/git.mjs` so Windows calls use:

`git.exe -c core.longpaths=true -C <repo> ...`

The override is process-scoped. LConnect does not write `core.longpaths` to local, global, or system Git configuration.

Regression coverage:

- new `tests/git-longpath-smoke.mjs`
- disposable Windows repo starts with local `core.longpaths=false`
- absolute file path observed in qualification: 347 characters
- `git_status` detects the deep untracked tree
- `git_commit` commits the exact deep file
- repository-local `core.longpaths=false` remains unchanged

## Qualification

Local qualification:

- syntax check: PASS, 85 files
- full test runner: PASS, 40 Node + 2 PowerShell suites
- Git long-path regression: PASS
- existing Git smoke/exact/sync suites: PASS
- public catalog: 154 tools, duplicate names none
- npm audit: 0 vulnerabilities
- `git diff --check`: PASS

Exact-commit GitHub CI:

- commit: `1f6bf8b721631bd7fefb1d74eb99c2ade02aea40`
- LConnect CI #184
- run: `38284363602`
- result: SUCCESS
- Windows Runtime smoke tests: SUCCESS
- Dependency audit: SUCCESS

## Deployment and live acceptance

Tracked-only deployment copied 264 Git-tracked files into the installed tree without mirror deletion.

Deployment verification after activation:

- source/install tracked parity: 264/264 exact
- source/installed manifest digest: `51f1bbec79880f5ca9de92b353c2a58eee50ddea9fc484999a2b513d76d1dab5`
- package: 1.3.1 source == installed
- preserved local paths: 6/6 present
- direct dependencies: all present
- live runtime: 1.3.1 / 154 tools
- activation PID observed: 14132
- catalog digest: `2ca33225b970dd70e1350d7b4e3d9290116448181031872d643111ae7ab4c374`
- duplicate public tool names: none
- restart log: `logs/restart-20261013-003239.log`
- restart readiness: PASS

Installed-tree qualification:

- `tests/git-longpath-smoke.mjs`: PASS
- absolute path length: 347
- legacy Git smoke: PASS
- tool-surface smoke: PASS
- installed npm audit: 0 vulnerabilities

Live connector physical acceptance after restart:

- disposable repo local `core.longpaths=false`
- absolute deep file path: 387 characters
- live `git_status`: PASS
- live `git_commit`: PASS
- commit SHA: `fcc5b4f3fc19e949f55fe360ec0e08cf3f71e62b`
- repo-local `core.longpaths` after commit: still `false`
- post-commit worktree: clean
- disposable probe cleanup: PASS

Local-state preservation:

- encrypted credential SHA-256 unchanged: `b773cace3931586913b84460c4b00cbd1ce33b78a165fa77355e259470cf2665`
- credential size: 880 bytes
- default `\LConnect Autostart`: absent
- `mcp-conf.yaml`, `node_modules`, `logs`, `runtime`, `tunnel-client.exe`, and `local-secrets`: preserved

## Release integrity

LCN-060 is post-v1.3.1 mainline hardening. It does not move, rewrite, or replace any published release tag.

The immutable v1.3.1 release still points to `e12bb90b4246ea4bb487894e6f3b6ddb96210d14`.

## Residual boundary

This repair applies to Git operations issued through LConnect on Windows. It does not make arbitrary legacy third-party programs outside LConnect/Git long-path aware.
