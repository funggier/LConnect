# LCN-058 — Optional AtLogOn Persistence

Status: **COMPLETE / DEPLOYED / PHYSICAL GREEN**

Activated: 2026-10-08

## Goal

Add an opt-in, removable and idempotent Windows AtLogOn persistence path for LConnect using the existing encrypted DPAPI CurrentUser credential.

## Baseline

- main activation HEAD: `00333ae85a4723eceee54802339833b779eff18e`
- LCN-057 implementation: `c949c3239cc5ede9e285dfd605b0e62392bdde4b`
- runtime: 1.3.0 / 154 tools / live GREEN
- public v1.3.0 and historical v1.2.2 releases/tags remain immutable

## Required behavior

- disabled/uninstalled by default
- Windows Scheduled Task trigger: AtLogOn for the current Windows user
- action: Windows PowerShell -> local `Start-LConnect.ps1 -NonInteractive`
- no Runtime API key or Organization ID on the scheduled-task command line
- credential preflight must require a decryptable stored DPAPI CurrentUser credential
- require local `mcp-conf.yaml` and `Start-LConnect.ps1`
- limited privilege by default; no elevation requirement
- exact task identity; no wildcard deletion
- ownership marker prevents overwriting/removing an unrelated task with the same name
- install is idempotent and may repair drift only for an LConnect-owned task
- status is read-only and reports whether the installed task matches the expected local root/user/action
- remove is idempotent and removes only an LConnect-owned task
- no MCP public tool is added; catalog remains 154

## User surface

- `Install-LConnectAutostart.cmd/.ps1`
- `Status-LConnectAutostart.cmd/.ps1`
- `Remove-LConnectAutostart.cmd/.ps1`
- shared helper: `scripts/LConnectAutostart.ps1`

## Safety boundary

The feature must never:
- enable itself during install/update
- store credentials in Task Scheduler
- invoke a different user profile by default
- overwrite/delete an unowned task with the selected identity
- use AtStartup in the default CurrentUser design
- force-stop a running LConnect instance

## Qualification

- pure/helper contract tests in CI without creating a real scheduled task
- PowerShell syntax
- full npm test
- npm audit zero high/critical
- exact-commit GitHub CI
- local physical qualification with a unique disposable task: install -> status -> inspect action/trigger/principal -> remove -> absence
- tracked-only deploy preserving local state
- no runtime restart required if implementation is scripts/docs/tests only
- final source/install parity

## Closure evidence

- initial implementation commit: `5c82674a0907ba87980c48c9e3397bbbffda3a14`; CI #177 SUCCESS
- physical qualification found Windows principal normalization `CDQ-P\\CDQ-P` -> `CDQ-P`
- authoritative identity-normalization fix commit: `973328c9dc51ed76ca6ee96517932a64dd75caf6`
- authoritative exact-commit CI: #178 / run `37817126580` — SUCCESS
- local qualification after fix: 39 Node + 2 PowerShell suites PASS; audit 0 vulnerabilities
- deployed source/install parity: 259/259 exact before closure docs
- physical disposable flow: install / idempotence / drift detect / repair / remove / absence — PASS
- default `\\LConnect Autostart` remained absent throughout qualification
- runtime restart not required; runtime remained 1.3.0 / 154 tools / PID 15508
- encrypted credential hash preserved exactly
- report: `../reports/LCN-20261009-058-optional-atlogon-persistence.md`
