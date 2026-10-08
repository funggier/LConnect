[CmdletBinding()]
param(
    [string]$TaskName = 'LConnect Autostart',
    [string]$TaskPath = '\'
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Helper = Join-Path $Root 'scripts\LConnectAutostart.ps1'
if (-not (Test-Path -LiteralPath $Helper -PathType Leaf)) {
    throw "Missing autostart helper: $Helper"
}
. $Helper

$Result = Install-LConnectAutostart -Root $Root -TaskName $TaskName -TaskPath $TaskPath
Write-Host "Autostart action: $($Result.action)"
Write-Host "Task: $($Result.status.task_path)$($Result.status.task_name)"
Write-Host "User: $($Result.status.current_user)"
Write-Host "Trigger: AtLogOn"
Write-Host "Run level: $($Result.status.principal_run_level)"
Write-Host "Credential preflight: $(if ($Result.status.credential_ready) { 'PASS' } else { 'FAIL' })"
Write-Host "Contract match: $(if ($Result.status.matches_expected) { 'PASS' } else { 'FAIL' })"
Write-Host 'LConnect autostart is enabled for this Windows user.'
