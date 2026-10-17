[CmdletBinding()]
param(
    [string]$ApiKey,
    [string]$OrganizationId,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Helper = Join-Path $Root 'scripts\SecureCredential.ps1'

if (-not (Test-Path -LiteralPath $Helper -PathType Leaf)) {
    throw "Missing secure credential helper: $Helper"
}
. $Helper

$Existing = Get-LConnectCredentialStatus -Root $Root
if ($Existing.exists -and -not $Force) {
    $Answer = Read-Host 'An encrypted LConnect Runtime API key already exists. Replace it? [y/N]'
    if ($Answer -notmatch '^(?i)y(es)?$') {
        Write-Host 'Credential setup cancelled. Existing encrypted API key was not changed.'
        exit 0
    }
}

if ([string]::IsNullOrWhiteSpace($ApiKey) -and -not [string]::IsNullOrWhiteSpace($env:CONTROL_PLANE_API_KEY)) {
    $ApiKey = [string]$env:CONTROL_PLANE_API_KEY
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    $Secure = Read-Host 'OpenAI Runtime API key (input is hidden)' -AsSecureString
    $Bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try {
        $ApiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Bstr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Bstr)
    }
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    throw 'Runtime API key cannot be empty.'
}

if (-not [string]::IsNullOrWhiteSpace($OrganizationId) -or
    -not [string]::IsNullOrWhiteSpace($env:CONTROL_PLANE_ORGANIZATION_ID)) {
    Write-Host 'Organization ID is managed by Setup-LConnect.cmd and is not stored in the encrypted credential.'
}

try {
    $Result = Write-LConnectStoredCredential -Root $Root -RuntimeApiKey $ApiKey
    Write-Host 'Encrypted LConnect Runtime API key saved.'
    Write-Host "File: $($Result.path)"
    Write-Host "Protection: $($Result.provider) / $($Result.scope)"
    Write-Host "ACL hardened: $($Result.acl_hardened)"
    Write-Host 'The Runtime API key was not written to console or logs.'
    Write-Host 'Use Setup-LConnect.cmd to configure Tunnel ID, Organization ID, and health port.'
}
finally {
    Remove-Variable ApiKey -ErrorAction SilentlyContinue
}
