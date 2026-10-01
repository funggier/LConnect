[CmdletBinding()]
param(
    [ValidateRange(500,10000)][int]$DelayMilliseconds = 1500,
    [ValidateRange(5,120)][int]$ReadyTimeoutSeconds = 30
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$CredentialHelper = Join-Path $Root 'scripts\SecureCredential.ps1'
$WorkerScript = Join-Path $Root 'scripts\Restart-LConnectWorker.ps1'

if (-not (Test-Path -LiteralPath $CredentialHelper -PathType Leaf)) {
    throw "Missing secure credential helper: $CredentialHelper"
}
if (-not (Test-Path -LiteralPath $WorkerScript -PathType Leaf)) {
    throw "Missing restart worker: $WorkerScript"
}

. $CredentialHelper

$CredentialStatus = Get-LConnectCredentialStatus -Root $Root
if (-not $CredentialStatus.exists -or -not $CredentialStatus.decrypt_pass) {
    $Code = if ($CredentialStatus.error_code) { $CredentialStatus.error_code } else { 'CREDENTIAL_NOT_CONFIGURED' }
    throw "RESTART_CREDENTIAL_NOT_CONFIGURED: A decryptable stored credential is required for deterministic self-restart ($Code). Run Setup-LConnectCredential.cmd first."
}

$PowerShellExe = Join-Path $PSHOME 'powershell.exe'
if (-not (Test-Path -LiteralPath $PowerShellExe -PathType Leaf)) {
    $PowerShellExe = (Get-Command powershell.exe -ErrorAction Stop).Source
}

function ConvertTo-SingleQuotedPowerShellLiteral {
    param([Parameter(Mandatory=$true)][string]$Value)
    return "'" + ($Value -replace "'", "''") + "'"
}

$WorkerLiteral = ConvertTo-SingleQuotedPowerShellLiteral -Value $WorkerScript
$RootLiteral = ConvertTo-SingleQuotedPowerShellLiteral -Value $Root
$Command = "& $WorkerLiteral -Root $RootLiteral -DelayMilliseconds $DelayMilliseconds -ReadyTimeoutSeconds $ReadyTimeoutSeconds"
$Encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Command))
$CommandLine = ('"{0}" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand {1}' -f $PowerShellExe, $Encoded)

try {
    $Startup = ([WmiClass]'Win32_ProcessStartup').CreateInstance()
    $Startup.ShowWindow = 0
    $ProcessClass = [WmiClass]'Win32_Process'
    $Result = $ProcessClass.Create($CommandLine, $Root, $Startup)

    if ([int]$Result.ReturnValue -ne 0 -or [int]$Result.ProcessId -le 0) {
        throw "Win32_Process.Create returned code $($Result.ReturnValue)."
    }

    Write-Host "LConnect restart scheduled (worker PID $($Result.ProcessId))."
    Write-Host "The current connection is expected to disconnect after approximately $DelayMilliseconds ms."
    Write-Host 'The worker will start LConnect non-interactively from local-secrets\credentials.json.enc.'
    Write-Host 'Check logs\restart-*.log and Status-LConnect.cmd after reconnecting.'
}
catch {
    throw "RESTART_SCHEDULE_FAILED: $($_.Exception.Message)"
}
