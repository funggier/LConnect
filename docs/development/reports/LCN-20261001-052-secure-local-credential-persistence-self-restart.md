# LCN 2026-10-01 — LCN-052 Secure Local Credential Persistence & Self-Restart

## Result

**IN PROGRESS — LOCAL IMPLEMENTATION GREEN; EXACT-COMMIT CI / INSTALLED LIVE RESTART PENDING**

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

## Pending

- exact implementation commit
- GitHub CI PASS
- deploy tracked files to `T:\Sanbox\openclawspace\tunnel-mcp-ok`
- create actual encrypted local credential using existing process environment without printing secret values
- verify `Status-LConnectCredential.ps1` reports decrypt/ACL PASS
- live detached restart: caller returns first, old tunnel stops, new tunnel/runtime becomes ready
- verify new PID/runtime identity and restart log
- verify `local-secrets/` survives source deployment and refresh-preservation checks
- close LCN-052
