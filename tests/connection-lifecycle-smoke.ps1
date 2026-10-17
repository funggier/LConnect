$ErrorActionPreference = 'Stop'
$SourceRoot = Split-Path -Parent $PSScriptRoot
$CredentialHelper = Join-Path $SourceRoot 'scripts\SecureCredential.ps1'
$ConnectionHelper = Join-Path $SourceRoot 'scripts\ConnectionSettings.ps1'
$TempRoot = Join-Path $env:TEMP ('lconnect-connection-lifecycle-smoke-' + [Guid]::NewGuid().ToString('N'))

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

try {
    New-Item -ItemType Directory -Force -Path $TempRoot | Out-Null
    . $CredentialHelper
    . $ConnectionHelper

    Remove-Item Env:CONTROL_PLANE_API_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:CONTROL_PLANE_ORGANIZATION_ID -ErrorAction SilentlyContinue

    $SyntheticKey = 'synthetic-runtime-key-connection-lifecycle'
    $SyntheticOrg = 'org-synthetic-connection-lifecycle'
    $SyntheticTunnel = 'tunnel_synthetic_connection_lifecycle'

    Save-LConnectConnectionSettings -Root $TempRoot -TunnelId $SyntheticTunnel -OrganizationId $SyntheticOrg -HealthPort 18124 | Out-Null
    $SavedCredential = Write-LConnectStoredCredential -Root $TempRoot -RuntimeApiKey $SyntheticKey
    Assert-True $SavedCredential.saved 'API-key-only credential save failed'

    $Status = Get-LConnectCredentialStatus -Root $TempRoot
    Assert-True $Status.decrypt_pass 'API-key-only credential decrypt failed'
    Assert-True $Status.runtime_api_key_configured 'Runtime API key should be configured'
    Assert-True (-not $Status.organization_id_configured) 'Organization ID should not be retained in new API-key-only credential'

    $Stored = Read-LConnectStoredCredential -Root $TempRoot
    Assert-True ($Stored.RuntimeApiKey -eq $SyntheticKey) 'API key round-trip mismatch'
    Assert-True ([string]::IsNullOrWhiteSpace([string]$Stored.OrganizationId)) 'API-key-only credential unexpectedly retained Organization ID'

    $Resolved = Resolve-LConnectCredential -Root $TempRoot -OrganizationId $SyntheticOrg -NonInteractive
    Assert-True ($Resolved.ApiKeySource -eq 'stored-dpapi') 'stored API key was not reused'
    Assert-True ($Resolved.OrganizationIdSource -eq 'parameter') 'connection Organization ID should come from connection settings caller'
    Write-Host 'separate API key / Organization resolution: PASS'

    $Removed = Remove-LConnectConnectionSettings -Root $TempRoot
    Assert-True $Removed.settings_removed 'connection settings were not cleared'

    $AfterClear = Get-LConnectCredentialStatus -Root $TempRoot
    Assert-True $AfterClear.decrypt_pass 'clearing connection settings must preserve API key credential'
    Assert-True $AfterClear.runtime_api_key_configured 'API key disappeared after connection clear'

    $MissingOrgMessage = $null
    try { Resolve-LConnectCredential -Root $TempRoot -NonInteractive | Out-Null } catch { $MissingOrgMessage = $_.Exception.Message }
    Assert-True ($MissingOrgMessage -like 'CREDENTIAL_NOT_CONFIGURED:*Organization ID*') 'cleared connection should require Organization ID again'
    Write-Host 'connection clear preserves API key but requires Organization again: PASS'

    foreach ($Name in @('Setup-LConnect.ps1','Setup-LConnect.cmd','Clear-LConnectSettings.ps1','Clear-LConnectSettings.cmd')) {
        Assert-True (Test-Path -LiteralPath (Join-Path $SourceRoot $Name) -PathType Leaf) "$Name missing"
    }

    $StartText = Get-Content -LiteralPath (Join-Path $SourceRoot 'Start-LConnect.ps1') -Raw
    Assert-True ($StartText -match 'Get-LConnectConnectionSettings') 'Start does not read separated connection settings'
    Assert-True ($StartText -match 'Write-LConnectProfile') 'Start does not generate profile from connection settings'
    Assert-True ($StartText -match 'Setup-LConnect\.ps1') 'Start does not invoke setup for missing connection values'

    $RestartText = Get-Content -LiteralPath (Join-Path $SourceRoot 'Restart-LConnect.ps1') -Raw
    Assert-True ($RestartText -match 'Get-LConnectConnectionSettings') 'Restart preflight does not check connection settings'
    Assert-True ($RestartText -match 'RESTART_CONNECTION_NOT_CONFIGURED') 'Restart connection-settings refusal code missing'
    Write-Host 'setup/start/clear/restart wiring: PASS'
}
finally {
    Remove-Item Env:CONTROL_PLANE_API_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:CONTROL_PLANE_ORGANIZATION_ID -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $TempRoot) { Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
