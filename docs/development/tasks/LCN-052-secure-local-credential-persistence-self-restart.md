# LCN-052 — Secure Local Credential Persistence & Self-Restart

Status: **COMPLETE**

## Goal

Allow LConnect to start and restart without requiring the user to re-enter OpenAI tunnel credentials on every restart, while keeping the persistent credential material inside the LConnect program folder and unreadable as plaintext.

## Design

Persistent local credential file:

`local-secrets/credentials.json.enc`

Protection:

- Windows DPAPI
- scope: `CurrentUser`
- whole credential payload encrypted
- DPAPI key material is not stored beside the encrypted file
- local secret directory/file ACL restricted to the current Windows user and SYSTEM
- `local-secrets/` is Git-ignored and preserved across refresh/deployment/update workflows

Encrypted payload contains:

- Runtime API key
- Organization ID

Outer metadata contains no secret values and identifies only format/provider/version/scope/timestamps/ciphertext.

## Credential precedence

`Start-LConnect.ps1` resolves each required value in this order:

1. explicit parameter
2. process environment
3. encrypted local credential file
4. interactive prompt

If a required value is still missing in non-interactive mode, fail with a deterministic `CREDENTIAL_NOT_CONFIGURED` diagnostic instead of attempting `Read-Host`.

Interactive first start may save the entered credential to the DPAPI file. The default answer is yes; users can decline.

## User commands

- `Setup-LConnectCredential.cmd`
- `Status-LConnectCredential.cmd`
- `Clear-LConnectCredential.cmd`
- `Restart-LConnect.cmd`

No command may print the Runtime API key, ciphertext plaintext, or a masked fragment that leaks secret material.

## Self-restart

`Restart-LConnect.ps1` schedules a detached PowerShell worker and returns before the current tunnel is stopped.

The worker:

1. waits briefly so the initiating MCP/tool call can return
2. stops the current LConnect tunnel
3. starts LConnect non-interactively from the DPAPI credential file
4. records bounded restart evidence without credentials

A stored/decryptable credential is required for deterministic self-restart. This avoids passing the Runtime API key on a command line.

No new MCP tool is required; existing `powershell_run` can invoke the restart script. Catalog target remains **122 tools**.

## Safety / compatibility

- no destructive worktree reset
- no secret committed to Git
- v1.2.1 tag/release remains immutable
- explicit parameter/environment startup continues to work
- existing `mcp-conf.yaml` remains local-only
- `Refresh-LConnect` must preserve `local-secrets/`
- deployment verification guidance must preserve `local-secrets`
- no automatic restart loop

## Validation

- DPAPI round-trip under CurrentUser
- encrypted file does not contain the synthetic API key or Organization ID as plaintext
- status exposes metadata/configured flags only
- clear removes only the local encrypted credential file
- non-interactive resolution succeeds from stored credential
- precedence explicit > environment > stored
- missing non-interactive credential fails deterministically without prompting
- restart front-end refuses when stored credential is unavailable/unreadable
- detached live restart returns first, then old tunnel exits and new runtime becomes ready
- source checks/tests/audit/diff-check PASS
- exact-commit GitHub CI PASS
- installed tracked parity and preserved local secret path PASS

## Evidence

Local implementation gate:

- DPAPI CurrentUser round-trip: PASS
- ciphertext plaintext exclusion: PASS
- ACL hardening: PASS
- parameter > environment > stored precedence: PASS
- non-interactive stored resolution: PASS
- missing non-interactive deterministic error: PASS
- restart preflight without stored credential: PASS
- PowerShell parse: PASS
- `npm run check`: PASS
- full `npm test`: PASS (~52.7s)
- catalog: 122 tools
- dependency audit: 0 vulnerabilities
- `git diff --check`: PASS
- exact-commit CI #144 / run `36896931112`: PASS
- installed tracked parity: 210/210 exact
- actual DPAPI credential decrypt/ACL/plaintext-exclusion: PASS
- live detached restart: PASS
- post-restart direct LConnect runtime: 1.2.1 / 122 tools, PID 8864

Corrective evidence:

- initial implementation commit `bb4880a8683cfdb6bdb65c5b9fdbd3a5dee1d8c3`
- CI #141 / run `36878591081`: FAIL only at new secure-credential smoke
- cause: GitHub runner Windows PowerShell could not load `Microsoft.PowerShell.Security` for `Set-Acl`
- repair: pure .NET ACL APIs; no PowerShell Security module dependency
- post-repair targeted smoke: PASS
- post-repair full `npm test`: PASS (~51.1s)

Second corrective evidence:

- CI #142 attempt 2 reached the new credential smoke and passed DPAPI/ACL/encryption/decryption/restart-preflight
- failure was only a CRLF-sensitive `.gitignore` regex
- assertion changed to trimmed line membership
- CRLF-safe targeted smoke: PASS
- full `npm test`: PASS (~52.0s)

Third corrective evidence:

- CI #143 / run `36896241883`: FAIL at final Git-ignore assertion
- exact committed test inspection showed the CRLF-safe assertion had not been included in the commit
- actual test patch applied and targeted secure credential smoke: PASS
- production credential/restart implementation unchanged by this correction

## Closure evidence

- final pre-closure implementation commit: `20ccdae5deeb3c70b3347337e95768cad194955b`
- CI #144 / run `36896931112`: SUCCESS
- source↔installed tracked parity: 210/210 exact
- encrypted local credential created from existing process environment without printing the Runtime API key
- credential decrypt test: PASS
- credential ACL hardened: PASS
- plaintext secret checks: false
- detached restart scheduled and returned before service replacement
- old tunnel PID 5748: stopped
- worker PID 6356: exited after successful completion
- new tunnel PID 11552: running
- new runtime PID 8864: running
- readiness: PASS
- direct ChatGPT/LConnect reconnect: PASS
- catalog: 122 tools
- no release/tag mutation
