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

$Result = Remove-LConnectAutostart -Root $Root -TaskName $TaskName -TaskPath $TaskPath
if ($Result.removed) {
    Write-Host "Removed LConnect autostart task: $($Result.task_path)$($Result.task_name)"
}
else {
    Write-Host "LConnect autostart task is already absent: $($Result.task_path)$($Result.task_name)"
}
