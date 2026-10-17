[CmdletBinding()]
param(
    [string]$TunnelId,
    [string]$ApiKey,
    [string]$OrganizationId,
    [int]$HealthPort = 0,
    [switch]$Force,
    [switch]$FillMissing
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$CredentialHelper = Join-Path $Root 'scripts\SecureCredential.ps1'
$ConnectionHelper = Join-Path $Root 'scripts\ConnectionSettings.ps1'
. $CredentialHelper
. $ConnectionHelper

Write-Host ''
Write-Host '========================================'
Write-Host ' LConnect - Connection Setup'
Write-Host '========================================'
Write-Host ''

$ExistingSettings = Get-LConnectConnectionSettings -Root $Root
$ExistingCredential = Get-LConnectCredentialStatus -Root $Root
$Stored = $null
if ($ExistingCredential.exists -and $ExistingCredential.decrypt_pass) {
    try { $Stored = Read-LConnectStoredCredential -Root $Root } catch {}
}

# Legacy migration source: an existing hand-maintained profile plus the old
# credential format that may still contain Organization ID.
if (-not $ExistingSettings -and $FillMissing) {
    $Legacy = Read-LConnectLegacyProfileConnection -Root $Root
    if ($Legacy) {
        if ([string]::IsNullOrWhiteSpace($TunnelId)) { $TunnelId = [string]$Legacy.tunnel_id }
        if ($HealthPort -eq 0) { $HealthPort = [int]$Legacy.health_port }
        if ([string]::IsNullOrWhiteSpace($OrganizationId) -and $Stored -and -not [string]::IsNullOrWhiteSpace([string]$Stored.OrganizationId)) {
            $OrganizationId = [string]$Stored.OrganizationId
        }
    }
}

if ($ExistingSettings -and -not $Force -and -not $FillMissing) {
    $Answer = Read-Host 'Existing LConnect connection settings found. Reconfigure them? [y/N]'
    if ($Answer -notmatch '^(?i)y(es)?$') {
        Write-Host 'Setup cancelled. Existing settings were not changed.'
        exit 0
    }
}

if ($FillMissing -and $ExistingSettings) {
    if ([string]::IsNullOrWhiteSpace($TunnelId)) { $TunnelId = [string]$ExistingSettings.tunnel_id }
    if ([string]::IsNullOrWhiteSpace($OrganizationId)) { $OrganizationId = [string]$ExistingSettings.organization_id }
    if ($HealthPort -eq 0) { $HealthPort = [int]$ExistingSettings.health_port }
}
if ($FillMissing -and [string]::IsNullOrWhiteSpace($ApiKey) -and $Stored) {
    $ApiKey = [string]$Stored.RuntimeApiKey
}

if ([string]::IsNullOrWhiteSpace($TunnelId)) {
    do { $TunnelId = Read-Host '1/4 Tunnel ID (tunnel_...)' } while ([string]::IsNullOrWhiteSpace($TunnelId))
}
elseif ($FillMissing) {
    Write-Host "1/4 Tunnel ID: reuse $TunnelId"
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    Write-Host '2/4 Runtime API key'
    $Secure = Read-Host '    API key (input hidden)' -AsSecureString
    $Bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try { $ApiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Bstr) }
    if ([string]::IsNullOrWhiteSpace($ApiKey)) { throw 'Runtime API key cannot be empty.' }
}
elseif ($FillMissing) {
    Write-Host '2/4 Runtime API key: reuse encrypted credential'
}

if ([string]::IsNullOrWhiteSpace($OrganizationId)) {
    do { $OrganizationId = Read-Host '3/4 Organization ID (org_... or org-...)' } while ([string]::IsNullOrWhiteSpace($OrganizationId))
}
elseif ($FillMissing) {
    Write-Host "3/4 Organization ID: reuse $OrganizationId"
}

if ($HealthPort -eq 0) {
    while ($true) {
        $Raw = Read-Host '4/4 Local health port [18020]'
        $Candidate = 0
        if ([string]::IsNullOrWhiteSpace($Raw)) { $Candidate = 18020 }
        elseif (-not [int]::TryParse($Raw, [ref]$Candidate)) {
            Write-Host '    Invalid port. Enter a number from 1024 to 65535.'
            continue
        }
        if ($Candidate -lt 1024 -or $Candidate -gt 65535) {
            Write-Host '    Port must be between 1024 and 65535.'
            continue
        }
        if (-not (Test-LConnectPortAvailable -Port $Candidate)) {
            Write-Host "    Port $Candidate is already in use. Choose another port."
            continue
        }
        $HealthPort = $Candidate
        break
    }
}
elseif ($HealthPort -lt 1024 -or $HealthPort -gt 65535) {
    throw 'HealthPort must be between 1024 and 65535.'
}
elseif ($FillMissing -and $ExistingSettings -and [int]$ExistingSettings.health_port -eq $HealthPort) {
    Write-Host "4/4 Local health port: reuse $HealthPort"
}
elseif (-not (Test-LConnectPortAvailable -Port $HealthPort)) {
    throw "HealthPort $HealthPort is already in use."
}

try {
    $SettingsResult = Save-LConnectConnectionSettings -Root $Root -TunnelId $TunnelId -OrganizationId $OrganizationId -HealthPort $HealthPort
    $CredentialResult = Write-LConnectStoredCredential -Root $Root -RuntimeApiKey $ApiKey
    $Profile = Write-LConnectProfile -Root $Root

    Write-Host ''
    Write-Host 'Setup result: PASS'
    Write-Host "Tunnel ID: $TunnelId"
    Write-Host 'Runtime API key: configured (encrypted with Windows DPAPI)'
    Write-Host "Organization ID: $OrganizationId"
    Write-Host "Health port: $HealthPort"
    Write-Host "Settings: $($SettingsResult.path)"
    Write-Host "Credential: $($CredentialResult.path)"
    Write-Host "Generated profile: $Profile"
    Write-Host ''
    Write-Host 'Saved values are reused automatically until explicitly cleared.'
    Write-Host 'Next: run Start-LConnect.cmd'
}
finally {
    Remove-Variable ApiKey, Stored -ErrorAction SilentlyContinue
}
