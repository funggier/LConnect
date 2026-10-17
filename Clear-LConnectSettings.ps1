[CmdletBinding()]
param(
    [ValidateSet('credential','connection','all')]
    [string]$Mode,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
. (Join-Path $Root 'scripts\SecureCredential.ps1')
. (Join-Path $Root 'scripts\ConnectionSettings.ps1')

Write-Host ''
Write-Host '========================================'
Write-Host ' LConnect - Clear Settings'
Write-Host '========================================'
Write-Host ''

if ([string]::IsNullOrWhiteSpace($Mode)) {
    Write-Host '1. Clear API key only'
    Write-Host '2. Clear connection settings (Tunnel ID / Organization / Port)'
    Write-Host '3. Clear ALL local LConnect settings'
    Write-Host '0. Cancel'
    $Choice = Read-Host 'Select'
    switch ($Choice) {
        '1' { $Mode = 'credential' }
        '2' { $Mode = 'connection' }
        '3' { $Mode = 'all' }
        default { Write-Host 'Cancelled.'; exit 0 }
    }
}

if (-not $Force) {
    $Answer = Read-Host "Confirm clear mode '$Mode'? [y/N]"
    if ($Answer -notmatch '^(?i)y(es)?$') {
        Write-Host 'Clear cancelled.'
        exit 0
    }
}

if ($Mode -in @('connection','all')) {
    # If an old credential still carries Organization ID, rewrite it as API-key
    # only before removing connection settings. This makes the clear semantic
    # real while preserving the encrypted API key when Mode=connection.
    $CredentialStatus = Get-LConnectCredentialStatus -Root $Root
    if ($Mode -eq 'connection' -and $CredentialStatus.exists -and $CredentialStatus.decrypt_pass) {
        $Stored = Read-LConnectStoredCredential -Root $Root
        Write-LConnectStoredCredential -Root $Root -RuntimeApiKey $Stored.RuntimeApiKey | Out-Null
        Remove-Variable Stored -ErrorAction SilentlyContinue
    }

    $RemovedConnection = Remove-LConnectConnectionSettings -Root $Root
    Write-Host "Connection settings: $(if ($RemovedConnection.settings_removed) { 'cleared' } else { 'already absent' })"
    Write-Host "Tunnel profile: $(if ($RemovedConnection.profile_removed) { 'cleared' } else { 'already absent' })"
}

if ($Mode -in @('credential','all')) {
    $RemovedCredential = Remove-LConnectStoredCredential -Root $Root
    Write-Host "API key credential: $(if ($RemovedCredential.removed) { 'cleared' } else { 'already absent' })"
}

if ($Mode -eq 'all') {
    foreach ($Name in @('runtime','logs')) {
        $Path = Join-Path $Root $Name
        if (Test-Path -LiteralPath $Path) {
            Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
        }
        New-Item -ItemType Directory -Force -Path $Path | Out-Null
    }
    Write-Host 'Runtime/log generated state: cleared'
}

Write-Host 'Clear result: PASS'
