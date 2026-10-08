$ErrorActionPreference = 'Stop'
$SourceRoot = Split-Path -Parent $PSScriptRoot
$Helper = Join-Path $SourceRoot 'scripts\LConnectAutostart.ps1'
$TempRoot = Join-Path $env:TEMP ('lconnect-autostart-smoke-' + [Guid]::NewGuid().ToString('N'))

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

try {
    New-Item -ItemType Directory -Force -Path $TempRoot | Out-Null
    Set-Content -LiteralPath (Join-Path $TempRoot 'Start-LConnect.ps1') -Value 'param([switch]$NonInteractive)' -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $TempRoot 'mcp-conf.yaml') -Value 'fixture: true' -Encoding UTF8

    . $Helper

    $SyntheticKey = 'synthetic-runtime-key-LCN058-smoke'
    $SyntheticOrg = 'org-synthetic-LCN058-smoke'
    Write-LConnectStoredCredential -Root $TempRoot -RuntimeApiKey $SyntheticKey -OrganizationId $SyntheticOrg | Out-Null

    $Preflight = Test-LConnectAutostartPreflight -Root $TempRoot
    Assert-True $Preflight.ok 'autostart preflight should pass with local profile/start/DPAPI credential'
    Assert-True $Preflight.credential_decrypt_pass 'autostart preflight credential decrypt failed'
    Write-Host 'autostart DPAPI/profile/start preflight: PASS'

    $Spec = Get-LConnectAutostartSpec -Root $TempRoot
    Assert-True ($Spec.task_name -eq 'LConnect Autostart') 'default task name mismatch'
    Assert-True ($Spec.task_path -eq '\') 'default task path mismatch'
    Assert-True ($Spec.trigger_type -eq 'MSFT_TaskLogonTrigger') 'trigger must be AtLogOn'
    Assert-True ($Spec.trigger_user_id -eq $Spec.current_user) 'AtLogOn user mismatch'
    Assert-True ($Spec.principal_user_id -eq $Spec.current_user) 'principal user mismatch'
    Assert-True ($Spec.principal_logon_type -eq 'Interactive') 'principal must use Interactive logon'
    Assert-True ($Spec.principal_run_level -eq 'Limited') 'principal must use Limited run level'
    Assert-True ($Spec.action_arguments -match '-NonInteractive') 'non-interactive start flag missing'
    Assert-True ($Spec.action_arguments -match 'Start-LConnect\.ps1') 'Start-LConnect action missing'
    Assert-True ($Spec.action_arguments -notmatch [regex]::Escape($SyntheticKey)) 'Runtime API key leaked into task action'
    Assert-True ($Spec.action_arguments -notmatch [regex]::Escape($SyntheticOrg)) 'Organization ID leaked into task action'
    Assert-True ($Spec.description -notmatch [regex]::Escape($SyntheticKey)) 'Runtime API key leaked into task description'
    Assert-True ($Spec.description -notmatch [regex]::Escape($SyntheticOrg)) 'Organization ID leaked into task description'
    Write-Host 'AtLogOn/current-user/limited/no-secret spec: PASS'

    $OwnedTask = [pscustomobject]@{
        found = $true
        task_name = $Spec.task_name
        task_path = $Spec.task_path
        state = 'Ready'
        description = $Spec.description
        enabled = $true
        actions = @([pscustomobject]@{
            execute = $Spec.powershell_exe
            arguments = $Spec.action_arguments
            working_directory = $Spec.working_directory
        })
        triggers = @([pscustomobject]@{
            type = $Spec.trigger_type
            user_id = $Spec.trigger_user_id
            enabled = $true
        })
        principal_user_id = $Spec.principal_user_id
        principal_logon_type = $Spec.principal_logon_type
        principal_run_level = $Spec.principal_run_level
    }

    Assert-True (Test-LConnectAutostartTaskOwned -Task $OwnedTask -Spec $Spec) 'owned task marker was not recognized'
    Assert-True (Test-LConnectAutostartIdentityEquivalent -Value $Spec.current_user -Spec $Spec) 'full current-user identity did not resolve'
    Assert-True (Test-LConnectAutostartIdentityEquivalent -Value $Spec.current_user_sid -Spec $Spec) 'current-user SID identity did not resolve'
    $ShortUser = ([string]$Spec.current_user).Split('\')[-1]
    Assert-True (Test-LConnectAutostartIdentityEquivalent -Value $ShortUser -Spec $Spec) 'Task Scheduler short current-user identity did not resolve to the current SID'
    $Match = Compare-LConnectAutostartTask -Task $OwnedTask -Spec $Spec
    Assert-True $Match.matches 'expected task contract did not match'
    Assert-True ($Match.mismatches.Count -eq 0) 'expected task produced mismatches'
    Write-Host 'ownership marker + SID-equivalent current-user contract match: PASS'

    $DriftTask = $OwnedTask.PSObject.Copy()
    $DriftTask.actions = @([pscustomobject]@{
        execute = $Spec.powershell_exe
        arguments = $Spec.action_arguments + ' -UnexpectedDrift'
        working_directory = $Spec.working_directory
    })
    $Drift = Compare-LConnectAutostartTask -Task $DriftTask -Spec $Spec
    Assert-True (-not $Drift.matches) 'action drift was not detected'
    Assert-True ($Drift.mismatches -contains 'action_arguments') 'action drift mismatch reason missing'
    Write-Host 'owned-task drift detection/repair boundary: PASS'

    $UnownedTask = $OwnedTask.PSObject.Copy()
    $UnownedTask.description = 'Unrelated task with same exact identity'
    Assert-True (-not (Test-LConnectAutostartTaskOwned -Task $UnownedTask -Spec $Spec)) 'unowned collision was accepted as owned'
    $UnownedCompare = Compare-LConnectAutostartTask -Task $UnownedTask -Spec $Spec
    Assert-True ($UnownedCompare.mismatches -contains 'ownership_marker') 'unowned collision reason missing'
    Write-Host 'unowned same-name collision refusal boundary: PASS'

    $OtherRoot = Join-Path $TempRoot 'other-root'
    New-Item -ItemType Directory -Force -Path $OtherRoot | Out-Null
    $OtherMarker = Get-LConnectAutostartOwnershipMarker -Root $OtherRoot -UserSid $Spec.current_user_sid
    Assert-True ($OtherMarker -ne $Spec.ownership_marker) 'ownership marker must be root-specific'

    $InvalidRejected = $false
    try { Get-LConnectAutostartSpec -Root $TempRoot -TaskName 'LConnect*Bad' | Out-Null } catch { $InvalidRejected = $true }
    Assert-True $InvalidRejected 'wildcard task identity was not rejected'
    Write-Host 'root-scoped marker + exact identity validation: PASS'

    foreach ($Name in @(
        'Install-LConnectAutostart.ps1',
        'Status-LConnectAutostart.ps1',
        'Remove-LConnectAutostart.ps1',
        'Install-LConnectAutostart.cmd',
        'Status-LConnectAutostart.cmd',
        'Remove-LConnectAutostart.cmd'
    )) {
        Assert-True (Test-Path -LiteralPath (Join-Path $SourceRoot $Name) -PathType Leaf) "$Name missing"
    }

    $InstallerText = Get-Content -LiteralPath (Join-Path $SourceRoot 'Install-LConnect.ps1') -Raw
    Assert-True ($InstallerText -notmatch 'Install-LConnectAutostart') 'base installer must not enable autostart'
    $InstallAutostartText = Get-Content -LiteralPath (Join-Path $SourceRoot 'Install-LConnectAutostart.ps1') -Raw
    $RemoveAutostartText = Get-Content -LiteralPath (Join-Path $SourceRoot 'Remove-LConnectAutostart.ps1') -Raw
    Assert-True ($InstallAutostartText -match 'Install-LConnectAutostart') 'install wrapper wiring missing'
    Assert-True ($RemoveAutostartText -match 'Remove-LConnectAutostart') 'remove wrapper wiring missing'
    Write-Host 'opt-in wrappers / base installer does not auto-enable: PASS'

    Write-Host 'autostart pure contract smoke: PASS'
}
finally {
    Remove-Variable SyntheticKey, SyntheticOrg, Spec, OwnedTask, DriftTask, UnownedTask -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $TempRoot) {
        Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
