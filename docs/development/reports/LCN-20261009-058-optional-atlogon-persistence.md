# LCN-058 — Optional AtLogOn Persistence Closure Report

Date: 2026-10-09  
Status: **COMPLETE / DEPLOYED / PHYSICAL GREEN**

## Goal

Add optional Windows AtLogOn persistence without changing the 154-tool MCP surface and without enabling persistence automatically.

The operator-facing contract is explicit:
- default state: disabled / no scheduled task
- enable: `Install-LConnectAutostart.cmd`
- inspect: `Status-LConnectAutostart.cmd`
- remove: `Remove-LConnectAutostart.cmd`
- trigger: AtLogOn for the current Windows user
- principal: Interactive / Limited
- action: local Windows PowerShell -> `Start-LConnect.ps1 -NonInteractive`
- Runtime API key and Organization ID are resolved from the existing DPAPI CurrentUser credential and are not stored in Task Scheduler

## Implementation

Initial implementation commit:

`5c82674a0907ba87980c48c9e3397bbbffda3a14`

Initial exact-commit CI:
- #177 / run `37815973917`
- conclusion: SUCCESS

Physical qualification found one Windows identity-normalization issue:
- expected current identity: `CDQ-P\CDQ-P`
- Task Scheduler normalized `Principal.UserId` to `CDQ-P`
- trigger identity remained `CDQ-P\CDQ-P`
- every other action/trigger/principal field matched
- the first physical install therefore failed the strict postcondition
- the disposable task was removed by the qualification `finally` block; cleanup PASS
- the default `\LConnect Autostart` task remained absent

The repair compares Task Scheduler user representations by resolving the candidate identity to the current-user SID. A bare local username is qualified only with the domain/machine prefix from the already-known current identity before SID translation.

Authoritative implementation/fix commit:

`973328c9dc51ed76ca6ee96517932a64dd75caf6`

Authoritative exact-commit CI:
- #178 / run `37817126580`
- conclusion: **SUCCESS**

## Files / contract

Added:
- `scripts/LConnectAutostart.ps1`
- `Install-LConnectAutostart.ps1/.cmd`
- `Status-LConnectAutostart.ps1/.cmd`
- `Remove-LConnectAutostart.ps1/.cmd`
- `tests/autostart-smoke.ps1`

The helper provides:
- deterministic root/task identity normalization
- ownership marker bound to normalized LConnect root hash + current Windows user SID
- preflight for local `Start-LConnect.ps1`, `mcp-conf.yaml`, and decryptable DPAPI credential
- exact read/status contract
- idempotent install
- owned-task drift repair
- same-name unowned-task overwrite/remove refusal
- idempotent remove
- no default persistence from base installer/update/refresh

`scripts/run-tests.mjs` now discovers all Windows `*-smoke.ps1` tests rather than hard-coding only the secure-credential suite.

## Local qualification

After the identity-normalization repair:
- `npm run check`: PASS, 84 files
- PowerShell parser: PASS, 20 files
- full `npm test`: PASS, 39 Node + 2 PowerShell suites
- autostart pure contract smoke: PASS
- secure credential smoke: PASS
- `npm audit --audit-level=high`: 0 vulnerabilities
- tool-surface smoke: PASS, 154 tools / duplicate names none
- `git diff --check`: PASS

## Deployment

Deployment method:
- exact source HEAD asserted
- clean worktree asserted
- Git-tracked files copied only
- no mirror delete
- no package/dependency update needed
- no runtime restart required because MCP/runtime code was unchanged

Post-deployment:
- source/install tracked parity: **259/259 exact**
- manifest digest: `cbb8f987df33239fe3bf456574991c3f0cd2abdc9225509c1a4210aef0395faf`
- preserved local paths: 6/6
- runtime: 1.3.0 / PID 15508 / 154 tools
- runtime catalog digest: `2ca33225b970dd70e1350d7b4e3d9290116448181031872d643111ae7ab4c374`
- duplicate public tool names: none

Encrypted credential SHA-256 remained unchanged:

`b773cace3931586913b84460c4b00cbd1ce33b78a165fa77355e259470cf2665`

## Physical qualification

Disposable task identity:

`\LConnect Autostart Qualification 20261009-FINAL`

The task was never manually started.

Final physical flow:
1. default `\LConnect Autostart`: absent
2. disposable task: absent
3. first install: `installed`
4. status: found / owned / exact contract / DPAPI preflight PASS
5. second install: `unchanged` (idempotence)
6. action arguments intentionally drifted
7. drift status detected `action_arguments`
8. install again: `repaired`
9. helper remove: removed=true
10. disposable task confirmed absent
11. default task confirmed absent
12. final cleanup: PASS

Observed Windows representation:
- trigger type: `MSFT_TaskLogonTrigger`
- trigger user: `CDQ-P\CDQ-P`
- principal user returned by Task Scheduler: `CDQ-P`
- principal logon type: `Interactive`
- principal run level: `Limited`
- action executable: `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`
- action target: installed `Start-LConnect.ps1 -NonInteractive`
- working directory: installed LConnect root
- credential/profile preflight: PASS

No default autostart task was left enabled by qualification.

## Closure

LCN-058 is **COMPLETE / DEPLOYED / PHYSICAL GREEN**.

Default persistent state remains **disabled**. The operator may explicitly enable it later with `Install-LConnectAutostart.cmd`.

Next planned task: **LCN-059 — v1.3.1 Operational Hardening Release**.
