# LCN 2026-10-01 — LCN-052 Secure Local Credential Persistence & Self-Restart

## Result

**COMPLETE — EXACT-COMMIT CI GREEN / DEPLOYED / LIVE SELF-RESTART GREEN**

## Goal

Make LConnect start/restart non-interactively after one local setup without storing the Runtime API key as plaintext or depending on an external credential manager.

## Implemented design

Persistent local state:

`local-secrets/credentials.json.enc`

Security:

- Windows DPAPI
- scope: `CurrentUser`
- whole payload encrypted: Runtime API key + Organization ID
- outer envelope contains only format/version/provider/scope/timestamps/ciphertext
- `local-secrets/` ACL inheritance is removed and access is restricted to current Windows user + SYSTEM
- encrypted file inherits the restricted parent ACL
- no separate encryption key file is stored beside the ciphertext
- `local-secrets/` is Git-ignored

Credential precedence:

1. explicit parameter
2. process environment
3. stored DPAPI credential
4. interactive prompt

Non-interactive missing credential returns deterministic `CREDENTIAL_NOT_CONFIGURED`.

## Commands

Added:

- `Setup-LConnectCredential.cmd/.ps1`
- `Status-LConnectCredential.cmd/.ps1`
- `Clear-LConnectCredential.cmd/.ps1`
- `Restart-LConnect.cmd/.ps1`

Shared helper:

- `scripts/SecureCredential.ps1`

Detached worker:

- `scripts/Restart-LConnectWorker.ps1`

No new MCP tool was added; the existing `powershell_run` can invoke `Restart-LConnect.ps1`. Catalog remains 122 tools.

## First-start behavior

`Start-LConnect.ps1` now:

- accepts `-NonInteractive` and `-NoCredentialSave`
- resolves parameter > environment > stored DPAPI > interactive
- on first interactive entry asks whether to save the values encrypted; blank/default answer means yes
- reports credential **source only**, never the secret value
- restores pre-existing process environment variables after launch instead of unconditionally deleting them

## Self-restart behavior

`Restart-LConnect.ps1` requires a stored credential that decrypts successfully, then creates a detached Windows process through `Win32_Process.Create`.

The detached worker:

1. waits 1.5 seconds by default so the initiating call can return
2. calls `Stop-LConnect.ps1`
3. calls `Start-LConnect.ps1 -NonInteractive`
4. waits for loopback `/readyz = 200`
5. records bounded non-secret evidence in `logs/restart-*.log`
6. exits; there is no automatic restart loop

The Runtime API key is not passed on the restart worker command line.

## Local smoke evidence

Direct DPAPI test:

- DPAPI save: PASS
- provider: `windows-dpapi`
- scope: `CurrentUser`
- restricted ACL: PASS
- decrypt test: PASS
- encrypted envelope excludes synthetic Runtime API key plaintext: PASS
- encrypted envelope excludes synthetic Organization ID plaintext: PASS
- decrypt round-trip: PASS
- environment precedence over stored: PASS
- parameter precedence over environment: PASS
- stored non-interactive resolution: PASS
- clear: PASS
- missing non-interactive error = `CREDENTIAL_NOT_CONFIGURED`: PASS
- restart preflight refuses missing stored credential: PASS

Repository validation:

- PowerShell parser: PASS across 15 current scripts
- `npm run check`: PASS
- full `npm test`: PASS
- full suite elapsed: approximately 52.7 s
- secure credential smoke included in `npm test`: PASS
- `PASS tools=122`
- `npm audit --audit-level=moderate`: PASS / 0 vulnerabilities
- `git diff --check`: PASS

## Installer / refresh / CI integration

- installer creates/hardens `local-secrets/`
- refresh preserves `local-secrets/`
- `.gitignore` excludes `local-secrets/`
- CI PowerShell syntax validation now parses every tracked `*.ps1` instead of a manually maintained list
- documentation updated for first-start setup, DPAPI limitations, self-restart and troubleshooting

## CI #141 corrective finding

Initial implementation commit:

`bb4880a8683cfdb6bdb65c5b9fdbd3a5dee1d8c3`

GitHub Actions run:

- CI #141
- run `36878591081`
- result: **FAIL**

The failure was isolated to the new secure-credential smoke after every existing runtime smoke had passed.

GitHub runner diagnostic:

`Set-Acl` was discoverable through `Microsoft.PowerShell.Security`, but that module could not be loaded by the Windows PowerShell process launched from `npm test`.

This was an ACL implementation portability problem, not a DPAPI failure.

Corrective action:

- removed runtime dependence on PowerShell `Set-Acl` / `Get-Acl`
- use .NET `System.IO.Directory.SetAccessControl`, `Directory.GetAccessControl`, and `File.GetAccessControl` directly
- ACL semantics remain current Windows SID + SYSTEM only, inheritance disabled on `local-secrets/`

Post-correction local evidence:

- direct .NET ACL set/read probe: PASS
- secure credential smoke: PASS
- PowerShell parse: PASS
- `npm run check`: PASS
- full `npm test`: PASS (~51.1 s)
- `PASS tools=122`
- `npm audit --audit-level=moderate`: PASS / 0 vulnerabilities
- `git diff --check`: PASS

## CI #142 findings

Corrective commit:

`55e6c96a76d2df9b35c67ca9011ff8882609d478`

Run `36879675672`:

- attempt 1: FAIL at legacy `environment-smoke.mjs` because hosted runner PowerShell exceeded the existing 15 s local execution budget; this test had passed in CI #141, so the same exact commit was rerun without changing timeout policy
- attempt 2: existing suite and DPAPI/ACL smoke progressed through credential encryption/decryption/restart-preflight successfully; final new assertion failed because the test used a line-ending-sensitive regex against `.gitignore` on CRLF checkout
- repository `.gitignore` did contain `local-secrets/`; the failure was test portability only

Corrective action:

- change the Git-ignore assertion to read lines, trim line endings/whitespace, and check exact entry membership
- no credential/runtime behavior changed

## CI #143 finding

Commit `569e7450ab79b0c5af45733af612c58afa817671` / run `36896241883` failed at the final `local-secrets/` Git-ignore assertion.

The intended CRLF-safe assertion had been described in the report but was not actually present in the committed test file; the commit contained documentation changes only for that correction. This was verified by reading the exact committed `tests/secure-credential-smoke.ps1`.

Corrective action:

- patch the test itself to read `.gitignore` as lines, trim each line, and use exact membership comparison for `local-secrets/`
- targeted secure credential smoke after the actual patch: PASS

No production credential/restart code changed in this correction.

## Final qualification and live deployment

Final implementation commit before closure:

`20ccdae5deeb3c70b3347337e95768cad194955b`

GitHub Actions:

- CI #144
- run `36896931112`
- exact head SHA: `20ccdae5deeb3c70b3347337e95768cad194955b`
- PowerShell syntax: PASS
- Node syntax check: PASS
- Runtime smoke tests: PASS
- Dependency audit: PASS
- conclusion: **SUCCESS**

Deployment:

- source tracked files: **210**
- copied to installed root: **210**
- source↔installed tracked parity after deployment: **210/210 exact**
- source/installed manifest digest: `892588f5a341407a59bbc178cf4731fde8bde9dc7f38a022bf6c9137f6b59fe6`
- preserved local paths present: `mcp-conf.yaml`, `node_modules/`, `logs/`, `runtime/`, `tunnel-client.exe`, `local-secrets/`

Actual local credential:

- file: `local-secrets/credentials.json.enc`
- format: `lconnect-secure-credential` v1
- provider/scope: `windows-dpapi / CurrentUser`
- decrypt test: PASS
- Runtime API key configured: PASS
- Organization ID configured: PASS
- ACL hardened: PASS
- plaintext Runtime API key presence in encrypted file: **false**
- plaintext Organization ID presence in encrypted file: **false**

Live detached restart:

- pre-restart tunnel PID: `5748`
- restart scheduling returned successfully before tunnel replacement
- detached worker PID: `6356`
- worker log: `logs/restart-20261002-001053.log`
- worker stopped the prior LConnect instance
- worker invoked `Start-LConnect.ps1 -NonInteractive`
- worker readiness result: **PASS**
- new tunnel PID: `11552`
- new MCP runtime PID: `8864`
- old tunnel PID after restart: not running
- restart worker after completion: not running
- new tunnel/runtime: running
- direct ChatGPT/LConnect reconnect: PASS
- runtime version/catalog: **1.2.1 / 122 tools**
- runtime working directory: installed root
- catalog digest unchanged: `4a8ef91a83938d4e835a7716c90c8784235708bdf31c5cb763b1d2911fecc525`

Final deployment verification from the restarted LConnect runtime:

- `ok=true`
- tracked files equal: PASS
- package version equal: PASS
- dependency declarations equal: PASS
- all direct dependencies present: PASS
- preserved paths all present: PASS
- runtime working directory matches installed root: PASS
- runtime version matches installed package: PASS
- expected tool count 122: PASS

## Closure

LCN-052 is **COMPLETE**.

The published v1.2.1 tag/release remains immutable. LCN-052 is a post-release main/runtime improvement; no new release was created as part of this task.
