[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Root,
    [ValidateRange(500,10000)][int]$DelayMilliseconds = 1500,
    [ValidateRange(5,120)][int]$ReadyTimeoutSeconds = 30
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path -LiteralPath $Root).Path
$LogDir = Join-Path $Root 'logs'
$Runtime = Join-Path $Root 'runtime'
$StopScript = Join-Path $Root 'Stop-LConnect.ps1'
$StartScript = Join-Path $Root 'Start-LConnect.ps1'

New-Item -ItemType Directory -Force -Path $LogDir, $Runtime | Out-Null
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$LogPath = Join-Path $LogDir "restart-$Stamp.log"

function Write-RestartLog {
    param([string]$Message)
    $Line = "{0} {1}" -f ([DateTimeOffset]::Now.ToString('o')), $Message
    Add-Content -LiteralPath $LogPath -Value $Line -Encoding UTF8
}

try {
    Write-RestartLog "worker_started pid=$PID"
    Start-Sleep -Milliseconds $DelayMilliseconds

    Write-RestartLog 'stopping_existing_lconnect'
    $StopOutput = & $StopScript 2>&1 | Out-String
    foreach ($Line in @($StopOutput -split "\r?\n" | Where-Object { $_ })) {
        Write-RestartLog ("stop: " + $Line)
    }

    Write-RestartLog 'starting_lconnect_noninteractive'
    $StartOutput = & $StartScript -NonInteractive 2>&1 | Out-String
    foreach ($Line in @($StartOutput -split "\r?\n" | Where-Object { $_ })) {
        Write-RestartLog ("start: " + $Line)
    }

    $LauncherPidPath = Join-Path $Runtime 'launcher.pid'
    $HealthUrlPath = Join-Path $Runtime 'health-url.txt'
    $Deadline = [DateTimeOffset]::UtcNow.AddSeconds($ReadyTimeoutSeconds)
    $Ready = $false
    $NewPid = $null

    while ([DateTimeOffset]::UtcNow -lt $Deadline) {
        if (Test-Path -LiteralPath $LauncherPidPath -PathType Leaf) {
            $RawPid = (Get-Content -LiteralPath $LauncherPidPath -Raw).Trim()
            $ParsedPid = 0
            if ([int]::TryParse($RawPid, [ref]$ParsedPid)) {
                $Process = Get-Process -Id $ParsedPid -ErrorAction SilentlyContinue
                if ($Process) {
                    $NewPid = $ParsedPid
                }
            }
        }

        if ($NewPid -and (Test-Path -LiteralPath $HealthUrlPath -PathType Leaf)) {
            $Base = (Get-Content -LiteralPath $HealthUrlPath -Raw).Trim().TrimEnd('/')
            if ($Base -match '^http://127\.0\.0\.1:\d+$') {
                try {
                    $Response = Invoke-WebRequest -UseBasicParsing -Uri ($Base + '/readyz') -TimeoutSec 2
                    if ([int]$Response.StatusCode -eq 200) {
                        $Ready = $true
                        break
                    }
                }
                catch {
                    # readiness is polled until timeout; do not log transient network text
                }
            }
        }

        Start-Sleep -Milliseconds 500
    }

    if (-not $Ready) {
        Write-RestartLog "restart_failed readiness_timeout_seconds=$ReadyTimeoutSeconds"
        exit 4
    }

    Write-RestartLog "restart_complete tunnel_pid=$NewPid readiness=pass"
    exit 0
}
catch {
    Write-RestartLog ("restart_failed " + $_.Exception.Message)
    exit 5
}
