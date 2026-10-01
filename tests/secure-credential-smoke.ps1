$ErrorActionPreference = 'Stop'
$SourceRoot = Split-Path -Parent $PSScriptRoot
$Helper = Join-Path $SourceRoot 'scripts\SecureCredential.ps1'
$TempRoot = Join-Path $env:TEMP ('lconnect-secure-credential-smoke-' + [Guid]::NewGuid().ToString('N'))

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

try {
    New-Item -ItemType Directory -Force -Path $TempRoot | Out-Null
    . $Helper

    $SyntheticKey = 'synthetic-runtime-key-LCN052-smoke'
    $SyntheticOrg = 'org-synthetic-LCN052-smoke'

    $Saved = Write-LConnectStoredCredential -Root $TempRoot -RuntimeApiKey $SyntheticKey -OrganizationId $SyntheticOrg
    Assert-True $Saved.saved 'credential save failed'
    Assert-True ($Saved.provider -eq 'windows-dpapi') 'unexpected credential provider'
    Assert-True ($Saved.scope -eq 'CurrentUser') 'unexpected DPAPI scope'
    Assert-True $Saved.acl_hardened 'credential ACL is not hardened'
    Write-Host 'DPAPI CurrentUser save + ACL: PASS'

    $CredentialPath = Get-LConnectCredentialPath -Root $TempRoot
    Assert-True ($CredentialPath -eq (Join-Path $TempRoot 'local-secrets\credentials.json.enc')) 'credential path is not local-secrets\credentials.json.enc'
    $Raw = Get-Content -LiteralPath $CredentialPath -Raw
    Assert-True ($Raw -notmatch [regex]::Escape($SyntheticKey)) 'Runtime API key leaked as plaintext'
    Assert-True ($Raw -notmatch [regex]::Escape($SyntheticOrg)) 'Organization ID leaked as plaintext'
    Write-Host 'encrypted file plaintext exclusion: PASS'

    $Status = Get-LConnectCredentialStatus -Root $TempRoot
    Assert-True $Status.decrypt_pass 'credential status decrypt failed'
    Assert-True $Status.runtime_api_key_configured 'Runtime API key status missing'
    Assert-True $Status.organization_id_configured 'Organization ID status missing'
    Assert-True $Status.acl_hardened 'credential status ACL failed'
    Write-Host 'metadata-only credential status: PASS'

    $Stored = Read-LConnectStoredCredential -Root $TempRoot
    Assert-True ($Stored.RuntimeApiKey -eq $SyntheticKey) 'stored Runtime API key round-trip mismatch'
    Assert-True ($Stored.OrganizationId -eq $SyntheticOrg) 'stored Organization ID round-trip mismatch'
    Write-Host 'DPAPI decrypt round-trip: PASS'

    $env:CONTROL_PLANE_API_KEY = 'env-key-LCN052-smoke'
    $env:CONTROL_PLANE_ORGANIZATION_ID = 'org-env-LCN052-smoke'
    $EnvironmentResolved = Resolve-LConnectCredential -Root $TempRoot -NonInteractive
    Assert-True ($EnvironmentResolved.ApiKeySource -eq 'environment') 'environment API key precedence failed'
    Assert-True ($EnvironmentResolved.OrganizationIdSource -eq 'environment') 'environment Organization ID precedence failed'

    $ParameterResolved = Resolve-LConnectCredential -Root $TempRoot -ApiKey 'param-key-LCN052-smoke' -OrganizationId 'org-param-LCN052-smoke' -NonInteractive
    Assert-True ($ParameterResolved.ApiKeySource -eq 'parameter') 'parameter API key precedence failed'
    Assert-True ($ParameterResolved.OrganizationIdSource -eq 'parameter') 'parameter Organization ID precedence failed'
    Write-Host 'parameter > environment > stored precedence: PASS'

    Remove-Item Env:CONTROL_PLANE_API_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:CONTROL_PLANE_ORGANIZATION_ID -ErrorAction SilentlyContinue
    $StoredResolved = Resolve-LConnectCredential -Root $TempRoot -NonInteractive
    Assert-True ($StoredResolved.ApiKeySource -eq 'stored-dpapi') 'stored API key resolution failed'
    Assert-True ($StoredResolved.OrganizationIdSource -eq 'stored-dpapi') 'stored Organization ID resolution failed'
    Write-Host 'stored non-interactive resolution: PASS'

    $Removed = Remove-LConnectStoredCredential -Root $TempRoot
    Assert-True $Removed.removed 'credential clear failed'
    $MissingMessage = $null
    try { Resolve-LConnectCredential -Root $TempRoot -NonInteractive | Out-Null } catch { $MissingMessage = $_.Exception.Message }
    Assert-True ($MissingMessage -like 'CREDENTIAL_NOT_CONFIGURED:*') 'missing non-interactive credential did not fail deterministically'
    Write-Host 'clear + deterministic missing credential error: PASS'

    $FixtureRoot = Join-Path $TempRoot 'restart-fixture'
    New-Item -ItemType Directory -Force -Path (Join-Path $FixtureRoot 'scripts') | Out-Null
    Copy-Item -LiteralPath (Join-Path $SourceRoot 'Restart-LConnect.ps1') -Destination (Join-Path $FixtureRoot 'Restart-LConnect.ps1')
    Copy-Item -LiteralPath $Helper -Destination (Join-Path $FixtureRoot 'scripts\SecureCredential.ps1')
    Copy-Item -LiteralPath (Join-Path $SourceRoot 'scripts\Restart-LConnectWorker.ps1') -Destination (Join-Path $FixtureRoot 'scripts\Restart-LConnectWorker.ps1')
    $PreviousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $RestartOutput = & powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $FixtureRoot 'Restart-LConnect.ps1') 2>&1 | Out-String
    $RestartExit = $LASTEXITCODE
    Assert-True ($RestartExit -ne 0) 'restart should refuse when stored credential is absent'
    Assert-True ($RestartOutput -match 'RESTART_CREDENTIAL_NOT_CONFIGURED') 'restart refusal code missing'
    Write-Host 'restart preflight requires stored decryptable credential: PASS'

    $GitIgnore = Get-Content -LiteralPath (Join-Path $SourceRoot '.gitignore') -Raw
    Assert-True ($GitIgnore -match '(?m)^local-secrets/$') 'local-secrets is not Git-ignored'
    Assert-True (Test-Path -LiteralPath (Join-Path $SourceRoot 'Setup-LConnectCredential.cmd')) 'Setup wrapper missing'
    Assert-True (Test-Path -LiteralPath (Join-Path $SourceRoot 'Status-LConnectCredential.cmd')) 'Status wrapper missing'
    Assert-True (Test-Path -LiteralPath (Join-Path $SourceRoot 'Clear-LConnectCredential.cmd')) 'Clear wrapper missing'
    Assert-True (Test-Path -LiteralPath (Join-Path $SourceRoot 'Restart-LConnect.cmd')) 'Restart wrapper missing'

    $StartText = Get-Content -LiteralPath (Join-Path $SourceRoot 'Start-LConnect.ps1') -Raw
    $RestartText = Get-Content -LiteralPath (Join-Path $SourceRoot 'Restart-LConnect.ps1') -Raw
    $WorkerText = Get-Content -LiteralPath (Join-Path $SourceRoot 'scripts\Restart-LConnectWorker.ps1') -Raw
    Assert-True ($StartText -match 'Resolve-LConnectCredential') 'Start does not use credential resolver'
    Assert-True ($StartText -match '\[switch\]\$NonInteractive') 'Start NonInteractive switch missing'
    Assert-True ($RestartText -match "\[WmiClass\]'Win32_Process'") 'Restart does not use detached WMI process creation'
    Assert-True ($WorkerText -match 'Start-LConnect\.ps1') 'Restart worker does not invoke Start-LConnect'
    Assert-True ($WorkerText -match '-NonInteractive') 'Restart worker does not request non-interactive start'
    Write-Host 'wrapper/restart wiring: PASS'

    Write-Host 'secure credential persistence smoke: PASS'
}
finally {
    Remove-Item Env:CONTROL_PLANE_API_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:CONTROL_PLANE_ORGANIZATION_ID -ErrorAction SilentlyContinue
    Remove-Variable SyntheticKey, SyntheticOrg, Stored, StoredResolved, EnvironmentResolved, ParameterResolved -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $TempRoot) { Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue }
}