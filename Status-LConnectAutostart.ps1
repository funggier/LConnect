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

$Status = Get-LConnectAutostartStatus -Root $Root -TaskName $TaskName -TaskPath $TaskPath
Write-Host "Task: $($Status.task_path)$($Status.task_name)"
Write-Host "Found: $($Status.found)"
Write-Host "Owned by this LConnect root/user: $($Status.owned)"
Write-Host "Contract match: $($Status.matches_expected)"
Write-Host "State: $($Status.state)"
Write-Host "Enabled: $($Status.enabled)"
Write-Host "Current user: $($Status.current_user)"
Write-Host "Trigger: $($Status.trigger_type)"
Write-Host "Trigger user: $($Status.trigger_user_id)"
Write-Host "Principal logon type: $($Status.principal_logon_type)"
Write-Host "Principal run level: $($Status.principal_run_level)"
Write-Host "Action: $($Status.action_execute)"
Write-Host "Arguments: $($Status.action_arguments)"
Write-Host "Working directory: $($Status.action_working_directory)"
Write-Host "Credential ready: $($Status.credential_ready)"
Write-Host "Profile ready: $($Status.profile_ready)"
Write-Host "Start script ready: $($Status.start_script_ready)"
if ($Status.mismatches.Count -gt 0) {
    Write-Host ("Mismatches: " + ($Status.mismatches -join ', '))
}

if (-not $Status.found) { exit 1 }
if (-not $Status.owned -or -not $Status.matches_expected -or -not $Status.preflight_ok) { exit 2 }
exit 0
