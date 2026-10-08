Set-StrictMode -Version Latest

$script:LConnectAutostartDefaultTaskName = 'LConnect Autostart'
$script:LConnectAutostartDefaultTaskPath = '\'
$script:LConnectAutostartOwnerVersion = 1
$script:LConnectAutostartOwnerPrefix = 'LConnect.Autostart.Owner'

$CredentialHelper = Join-Path $PSScriptRoot 'SecureCredential.ps1'
if (-not (Test-Path -LiteralPath $CredentialHelper -PathType Leaf)) {
    throw "AUTOSTART_HELPER_INVALID: Missing secure credential helper: $CredentialHelper"
}
. $CredentialHelper

function Normalize-LConnectAutostartRoot {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$Root)
    $Full = [System.IO.Path]::GetFullPath($Root)
    if ($Full.Length -gt 3) { $Full = $Full.TrimEnd('\') }
    return $Full
}

function Normalize-LConnectAutostartTaskPath {
    [CmdletBinding()]
    param([string]$TaskPath = '\')
    $Value = [string]$TaskPath
    if ([string]::IsNullOrWhiteSpace($Value)) { $Value = '\' }
    $Value = $Value.Replace('/', '\').Trim()
    if ($Value -match '[*?\[\]]') {
        throw 'AUTOSTART_INVALID_IDENTITY: TaskPath must not contain wildcard characters.'
    }
    if (-not $Value.StartsWith('\')) { $Value = '\' + $Value }
    if ($Value -ne '\' -and -not $Value.EndsWith('\')) { $Value += '\' }
    return $Value
}

function Assert-LConnectAutostartTaskName {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$TaskName)
    if ([string]::IsNullOrWhiteSpace($TaskName) -or $TaskName.Length -gt 238) {
        throw 'AUTOSTART_INVALID_IDENTITY: TaskName is empty or too long.'
    }
    if ($TaskName -match '[\\/*?\[\]]') {
        throw 'AUTOSTART_INVALID_IDENTITY: TaskName must not contain path separators or wildcard characters.'
    }
}

function Get-LConnectAutostartCurrentIdentity {
    [CmdletBinding()]
    param()
    $Identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    return [pscustomobject]@{
        name = [string]$Identity.Name
        sid = [string]$Identity.User.Value
    }
}

function Get-LConnectAutostartSha256 {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$Value)
    $Utf8 = New-Object System.Text.UTF8Encoding($false)
    $Bytes = $Utf8.GetBytes($Value)
    $Sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $Digest = $Sha.ComputeHash($Bytes)
        return ([BitConverter]::ToString($Digest) -replace '-', '').ToLowerInvariant()
    }
    finally {
        $Sha.Dispose()
        [Array]::Clear($Bytes, 0, $Bytes.Length)
    }
}

function Get-LConnectAutostartPowerShellPath {
    [CmdletBinding()]
    param()
    $Candidate = Join-Path $PSHOME 'powershell.exe'
    if (Test-Path -LiteralPath $Candidate -PathType Leaf) {
        return [System.IO.Path]::GetFullPath($Candidate)
    }
    $Command = Get-Command powershell.exe -ErrorAction Stop
    return [System.IO.Path]::GetFullPath([string]$Command.Source)
}

function Quote-LConnectAutostartArgument {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$Value)
    if ($Value.Contains('"')) {
        throw 'AUTOSTART_INVALID_PATH: Double quotes are not supported in the LConnect root path.'
    }
    return '"' + $Value + '"'
}

function Get-LConnectAutostartOwnershipMarker {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][string]$Root,
        [Parameter(Mandatory=$true)][string]$UserSid
    )
    $NormalizedRoot = Normalize-LConnectAutostartRoot -Root $Root
    $RootHash = Get-LConnectAutostartSha256 -Value $NormalizedRoot.ToLowerInvariant()
    return ('{0}.v{1};root_sha256={2};user_sid={3}' -f $script:LConnectAutostartOwnerPrefix, $script:LConnectAutostartOwnerVersion, $RootHash, $UserSid)
}

function Get-LConnectAutostartSpec {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][string]$Root,
        [string]$TaskName = $script:LConnectAutostartDefaultTaskName,
        [string]$TaskPath = $script:LConnectAutostartDefaultTaskPath
    )
    Assert-LConnectAutostartTaskName -TaskName $TaskName
    $NormalizedTaskPath = Normalize-LConnectAutostartTaskPath -TaskPath $TaskPath
    $NormalizedRoot = Normalize-LConnectAutostartRoot -Root $Root
    $Identity = Get-LConnectAutostartCurrentIdentity
    $PowerShellExe = Get-LConnectAutostartPowerShellPath
    $StartScript = Join-Path $NormalizedRoot 'Start-LConnect.ps1'
    $Profile = Join-Path $NormalizedRoot 'mcp-conf.yaml'
    $CredentialFile = Get-LConnectCredentialPath -Root $NormalizedRoot
    $Marker = Get-LConnectAutostartOwnershipMarker -Root $NormalizedRoot -UserSid $Identity.sid
    $QuotedStart = Quote-LConnectAutostartArgument -Value $StartScript
    $Arguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $QuotedStart -NonInteractive"

    return [pscustomobject]@{
        schema_version = 1
        task_name = $TaskName
        task_path = $NormalizedTaskPath
        root = $NormalizedRoot
        current_user = $Identity.name
        current_user_sid = $Identity.sid
        powershell_exe = $PowerShellExe
        action_arguments = $Arguments
        working_directory = $NormalizedRoot
        start_script = $StartScript
        profile_file = $Profile
        credential_file = $CredentialFile
        trigger_type = 'MSFT_TaskLogonTrigger'
        trigger_user_id = $Identity.name
        principal_user_id = $Identity.name
        principal_logon_type = 'Interactive'
        principal_run_level = 'Limited'
        ownership_marker = $Marker
        description = "$Marker | Starts LConnect for the current Windows user at logon."
    }
}

function Test-LConnectAutostartPreflight {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$Root)
    $NormalizedRoot = Normalize-LConnectAutostartRoot -Root $Root
    $Start = Join-Path $NormalizedRoot 'Start-LConnect.ps1'
    $Profile = Join-Path $NormalizedRoot 'mcp-conf.yaml'
    $Credential = Get-LConnectCredentialStatus -Root $NormalizedRoot
    $Result = [ordered]@{
        ok = $false
        root = $NormalizedRoot
        start_script_exists = (Test-Path -LiteralPath $Start -PathType Leaf)
        profile_exists = (Test-Path -LiteralPath $Profile -PathType Leaf)
        credential_exists = [bool]$Credential.exists
        credential_decrypt_pass = [bool]$Credential.decrypt_pass
        credential_acl_hardened = [bool]$Credential.acl_hardened
        error_code = $null
    }
    if (-not $Result.start_script_exists) {
        $Result.error_code = 'AUTOSTART_START_SCRIPT_MISSING'
    }
    elseif (-not $Result.profile_exists) {
        $Result.error_code = 'AUTOSTART_PROFILE_MISSING'
    }
    elseif (-not $Result.credential_exists -or -not $Result.credential_decrypt_pass) {
        $Result.error_code = if ($Credential.error_code) { 'AUTOSTART_' + [string]$Credential.error_code } else { 'AUTOSTART_CREDENTIAL_NOT_CONFIGURED' }
    }
    else {
        $Result.ok = $true
    }
    return [pscustomobject]$Result
}

function Get-LConnectAutostartTaskDetails {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][string]$TaskName,
        [string]$TaskPath = '\'
    )
    Assert-LConnectAutostartTaskName -TaskName $TaskName
    $NormalizedTaskPath = Normalize-LConnectAutostartTaskPath -TaskPath $TaskPath
    $Task = Get-ScheduledTask -TaskName $TaskName -TaskPath $NormalizedTaskPath -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $Task) {
        return [pscustomobject]@{ found = $false; task_name = $TaskName; task_path = $NormalizedTaskPath }
    }
    $Actions = @($Task.Actions | ForEach-Object {
        [pscustomobject]@{
            execute = if ($null -eq $_.Execute) { $null } else { [string]$_.Execute }
            arguments = if ($null -eq $_.Arguments) { $null } else { [string]$_.Arguments }
            working_directory = if ($null -eq $_.WorkingDirectory) { $null } else { [string]$_.WorkingDirectory }
        }
    })
    $Triggers = @($Task.Triggers | ForEach-Object {
        [pscustomobject]@{
            type = if ($null -eq $_.CimClass) { $null } else { [string]$_.CimClass.CimClassName }
            user_id = if ($null -eq $_.UserId) { $null } else { [string]$_.UserId }
            enabled = if ($null -eq $_.Enabled) { $null } else { [bool]$_.Enabled }
        }
    })
    return [pscustomobject]@{
        found = $true
        task_name = [string]$Task.TaskName
        task_path = [string]$Task.TaskPath
        state = [string]$Task.State
        description = if ($null -eq $Task.Description) { '' } else { [string]$Task.Description }
        enabled = if ($null -eq $Task.Settings) { $null } else { [bool]$Task.Settings.Enabled }
        actions = $Actions
        triggers = $Triggers
        principal_user_id = if ($null -eq $Task.Principal) { $null } else { [string]$Task.Principal.UserId }
        principal_logon_type = if ($null -eq $Task.Principal) { $null } else { [string]$Task.Principal.LogonType }
        principal_run_level = if ($null -eq $Task.Principal) { $null } else { [string]$Task.Principal.RunLevel }
    }
}

function Test-LConnectAutostartTaskOwned {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]$Task,
        [Parameter(Mandatory=$true)]$Spec
    )
    if (-not $Task.found) { return $false }
    if ([string]::IsNullOrWhiteSpace([string]$Task.description)) { return $false }
    return ([string]$Task.description).StartsWith([string]$Spec.ownership_marker, [StringComparison]::Ordinal)
}

function Test-LConnectAutostartIdentityEquivalent {
    [CmdletBinding()]
    param(
        [AllowNull()][string]$Value,
        [Parameter(Mandatory=$true)]$Spec
    )

    if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
    if ($Value -ieq [string]$Spec.current_user) { return $true }
    if ($Value -ieq [string]$Spec.current_user_sid) { return $true }

    try {
        $Candidate = $Value
        if ($Candidate.IndexOf('\') -lt 0 -and ([string]$Spec.current_user).IndexOf('\') -ge 0) {
            $Parts = ([string]$Spec.current_user).Split('\', 2)
            if ($Parts.Count -eq 2 -and $Candidate -ieq $Parts[1]) {
                $Candidate = $Parts[0] + '\' + $Candidate
            }
        }

        $Account = New-Object System.Security.Principal.NTAccount($Candidate)
        $Sid = $Account.Translate([System.Security.Principal.SecurityIdentifier])
        return ([string]$Sid.Value -eq [string]$Spec.current_user_sid)
    }
    catch {
        return $false
    }
}

function Compare-LConnectAutostartTask {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]$Task,
        [Parameter(Mandatory=$true)]$Spec
    )
    $Mismatches = New-Object System.Collections.Generic.List[string]
    if (-not $Task.found) {
        [void]$Mismatches.Add('task_missing')
        return [pscustomobject]@{ matches = $false; mismatches = @($Mismatches) }
    }
    if (-not (Test-LConnectAutostartTaskOwned -Task $Task -Spec $Spec)) { [void]$Mismatches.Add('ownership_marker') }

    $Actions = @($Task.actions)
    if ($Actions.Count -ne 1) { [void]$Mismatches.Add('action_count') }
    else {
        if (-not ([string]$Actions[0].execute -ieq [string]$Spec.powershell_exe)) { [void]$Mismatches.Add('action_execute') }
        if ([string]$Actions[0].arguments -cne [string]$Spec.action_arguments) { [void]$Mismatches.Add('action_arguments') }
        if (-not ([string]$Actions[0].working_directory -ieq [string]$Spec.working_directory)) { [void]$Mismatches.Add('action_working_directory') }
    }

    $Triggers = @($Task.triggers)
    if ($Triggers.Count -ne 1) { [void]$Mismatches.Add('trigger_count') }
    else {
        if ([string]$Triggers[0].type -cne [string]$Spec.trigger_type) { [void]$Mismatches.Add('trigger_type') }
        if (-not (Test-LConnectAutostartIdentityEquivalent -Value ([string]$Triggers[0].user_id) -Spec $Spec)) { [void]$Mismatches.Add('trigger_user') }
        if ($null -ne $Triggers[0].enabled -and -not [bool]$Triggers[0].enabled) { [void]$Mismatches.Add('trigger_disabled') }
    }

    if (-not (Test-LConnectAutostartIdentityEquivalent -Value ([string]$Task.principal_user_id) -Spec $Spec)) { [void]$Mismatches.Add('principal_user') }
    if (-not ([string]$Task.principal_logon_type -ieq [string]$Spec.principal_logon_type)) { [void]$Mismatches.Add('principal_logon_type') }
    if (-not ([string]$Task.principal_run_level -ieq [string]$Spec.principal_run_level)) { [void]$Mismatches.Add('principal_run_level') }
    if ($null -ne $Task.enabled -and -not [bool]$Task.enabled) { [void]$Mismatches.Add('task_disabled') }

    return [pscustomobject]@{ matches = ($Mismatches.Count -eq 0); mismatches = @($Mismatches) }
}

function Get-LConnectAutostartStatus {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][string]$Root,
        [string]$TaskName = $script:LConnectAutostartDefaultTaskName,
        [string]$TaskPath = $script:LConnectAutostartDefaultTaskPath
    )
    $Spec = Get-LConnectAutostartSpec -Root $Root -TaskName $TaskName -TaskPath $TaskPath
    $Preflight = Test-LConnectAutostartPreflight -Root $Spec.root
    $Task = Get-LConnectAutostartTaskDetails -TaskName $Spec.task_name -TaskPath $Spec.task_path
    $Owned = if ($Task.found) { Test-LConnectAutostartTaskOwned -Task $Task -Spec $Spec } else { $false }
    $Comparison = Compare-LConnectAutostartTask -Task $Task -Spec $Spec
    return [pscustomobject]@{
        task_name = $Spec.task_name
        task_path = $Spec.task_path
        root = $Spec.root
        current_user = $Spec.current_user
        current_user_sid = $Spec.current_user_sid
        found = [bool]$Task.found
        owned = [bool]$Owned
        matches_expected = [bool]$Comparison.matches
        mismatches = @($Comparison.mismatches)
        state = if ($Task.found) { $Task.state } else { $null }
        enabled = if ($Task.found) { $Task.enabled } else { $null }
        action_execute = if ($Task.found -and @($Task.actions).Count -eq 1) { $Task.actions[0].execute } else { $null }
        action_arguments = if ($Task.found -and @($Task.actions).Count -eq 1) { $Task.actions[0].arguments } else { $null }
        action_working_directory = if ($Task.found -and @($Task.actions).Count -eq 1) { $Task.actions[0].working_directory } else { $null }
        trigger_type = if ($Task.found -and @($Task.triggers).Count -eq 1) { $Task.triggers[0].type } else { $null }
        trigger_user_id = if ($Task.found -and @($Task.triggers).Count -eq 1) { $Task.triggers[0].user_id } else { $null }
        principal_user_id = if ($Task.found) { $Task.principal_user_id } else { $null }
        principal_logon_type = if ($Task.found) { $Task.principal_logon_type } else { $null }
        principal_run_level = if ($Task.found) { $Task.principal_run_level } else { $null }
        credential_ready = [bool]$Preflight.credential_decrypt_pass
        profile_ready = [bool]$Preflight.profile_exists
        start_script_ready = [bool]$Preflight.start_script_exists
        preflight_ok = [bool]$Preflight.ok
        preflight_error_code = $Preflight.error_code
    }
}

function Register-LConnectAutostartTask {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)]$Spec)
    $Action = New-ScheduledTaskAction -Execute $Spec.powershell_exe -Argument $Spec.action_arguments -WorkingDirectory $Spec.working_directory
    $Trigger = New-ScheduledTaskTrigger -AtLogOn -User $Spec.trigger_user_id
    $Principal = New-ScheduledTaskPrincipal -UserId $Spec.principal_user_id -LogonType Interactive -RunLevel Limited
    $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    Register-ScheduledTask -TaskName $Spec.task_name -TaskPath $Spec.task_path -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Description $Spec.description -Force -ErrorAction Stop | Out-Null
}

function Install-LConnectAutostart {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][string]$Root,
        [string]$TaskName = $script:LConnectAutostartDefaultTaskName,
        [string]$TaskPath = $script:LConnectAutostartDefaultTaskPath
    )
    $Spec = Get-LConnectAutostartSpec -Root $Root -TaskName $TaskName -TaskPath $TaskPath
    $Preflight = Test-LConnectAutostartPreflight -Root $Spec.root
    if (-not $Preflight.ok) {
        throw "$($Preflight.error_code): Autostart preflight failed. Configure mcp-conf.yaml and a decryptable DPAPI CurrentUser credential first."
    }

    $Before = Get-LConnectAutostartTaskDetails -TaskName $Spec.task_name -TaskPath $Spec.task_path
    $ActionName = 'installed'
    if ($Before.found) {
        if (-not (Test-LConnectAutostartTaskOwned -Task $Before -Spec $Spec)) {
            throw "AUTOSTART_TASK_CONFLICT: Refusing to overwrite unowned scheduled task $($Spec.task_path)$($Spec.task_name)."
        }
        $Comparison = Compare-LConnectAutostartTask -Task $Before -Spec $Spec
        if ($Comparison.matches) {
            return [pscustomobject]@{ ok = $true; action = 'unchanged'; repaired = $false; status = (Get-LConnectAutostartStatus -Root $Spec.root -TaskName $Spec.task_name -TaskPath $Spec.task_path) }
        }
        $ActionName = 'repaired'
    }

    Register-LConnectAutostartTask -Spec $Spec
    $After = Get-LConnectAutostartStatus -Root $Spec.root -TaskName $Spec.task_name -TaskPath $Spec.task_path
    if (-not $After.found -or -not $After.owned -or -not $After.matches_expected) {
        throw 'AUTOSTART_POSTCONDITION_FAILED: Scheduled task was registered but does not match the expected LConnect contract.'
    }
    return [pscustomobject]@{ ok = $true; action = $ActionName; repaired = ($ActionName -eq 'repaired'); status = $After }
}

function Remove-LConnectAutostart {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][string]$Root,
        [string]$TaskName = $script:LConnectAutostartDefaultTaskName,
        [string]$TaskPath = $script:LConnectAutostartDefaultTaskPath
    )
    $Spec = Get-LConnectAutostartSpec -Root $Root -TaskName $TaskName -TaskPath $TaskPath
    $Before = Get-LConnectAutostartTaskDetails -TaskName $Spec.task_name -TaskPath $Spec.task_path
    if (-not $Before.found) {
        return [pscustomobject]@{ ok = $true; removed = $false; already_absent = $true; task_name = $Spec.task_name; task_path = $Spec.task_path }
    }
    if (-not (Test-LConnectAutostartTaskOwned -Task $Before -Spec $Spec)) {
        throw "AUTOSTART_TASK_CONFLICT: Refusing to remove unowned scheduled task $($Spec.task_path)$($Spec.task_name)."
    }
    Unregister-ScheduledTask -TaskName $Spec.task_name -TaskPath $Spec.task_path -Confirm:$false -ErrorAction Stop
    $After = Get-LConnectAutostartTaskDetails -TaskName $Spec.task_name -TaskPath $Spec.task_path
    if ($After.found) { throw 'AUTOSTART_REMOVE_FAILED: Scheduled task still exists after unregister.' }
    return [pscustomobject]@{ ok = $true; removed = $true; already_absent = $false; task_name = $Spec.task_name; task_path = $Spec.task_path }
}
