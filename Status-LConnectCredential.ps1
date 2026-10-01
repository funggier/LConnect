[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Helper = Join-Path $Root 'scripts\SecureCredential.ps1'

if (-not (Test-Path -LiteralPath $Helper -PathType Leaf)) {
    throw "Missing secure credential helper: $Helper"
}
. $Helper

$Status = Get-LConnectCredentialStatus -Root $Root

Write-Host "Credential file: $($Status.credential_file)"
Write-Host ("Exists: {0}" -f $Status.exists)

if ($Status.exists) {
    Write-Host "Format: $($Status.format)"
    Write-Host "Version: $($Status.version)"
    Write-Host "Protection: $($Status.provider) / $($Status.scope)"
    Write-Host "Decrypt test: $(if ($Status.decrypt_pass) { 'PASS' } else { 'FAIL' })"
    Write-Host "Runtime API key: $(if ($Status.runtime_api_key_configured) { 'configured' } else { 'not configured' })"
    Write-Host "Organization ID: $(if ($Status.organization_id_configured) { 'configured' } else { 'not configured' })"
    Write-Host "ACL hardened: $($Status.acl_hardened)"
    if ($Status.created_at) { Write-Host "Created: $($Status.created_at)" }
    if ($Status.updated_at) { Write-Host "Updated: $($Status.updated_at)" }
}

if (-not $Status.decrypt_pass) {
    Write-Host "Status code: $($Status.error_code)"
    exit 2
}

exit 0
