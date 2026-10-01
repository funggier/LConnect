[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Helper = Join-Path $Root 'scripts\SecureCredential.ps1'

if (-not (Test-Path -LiteralPath $Helper -PathType Leaf)) {
    throw "Missing secure credential helper: $Helper"
}
. $Helper

$Status = Get-LConnectCredentialStatus -Root $Root
if (-not $Status.exists) {
    Write-Host 'No encrypted LConnect credential is configured.'
    exit 0
}

if (-not $Force) {
    $Answer = Read-Host 'Delete the encrypted LConnect credential file? [y/N]'
    if ($Answer -notmatch '^(?i)y(es)?$') {
        Write-Host 'Credential clear cancelled.'
        exit 0
    }
}

$Result = Remove-LConnectStoredCredential -Root $Root
if ($Result.removed) {
    Write-Host 'Encrypted LConnect credential file removed.'
    Write-Host 'No claim of secure media erasure is made; only the local encrypted file was deleted.'
}
else {
    Write-Host 'No encrypted LConnect credential file was present.'
}
