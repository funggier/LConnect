[CmdletBinding(SupportsShouldProcess=$true)]
param(
    [switch]$KeepLogs,
    [string]$RootPath = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'

$Root = (Resolve-Path -LiteralPath $RootPath).Path
$Runtime = Join-Path $Root 'runtime'
$LogDir = Join-Path $Root 'logs'
$LauncherPidFile = Join-Path $Runtime 'launcher.pid'
$TunnelPidFile = Join-Path $Runtime 'tunnel-client.pid'
$ExpectedTunnel = Join-Path $Root 'tunnel-client.exe'

function Get-RecordedProcess {
    param(
        [Parameter(Mandatory=$true)][string]$PidFile
    )

    if (-not (Test-Path -LiteralPath $PidFile -PathType Leaf)) {
        return $null
    }

    $Raw = (Get-Content -LiteralPath $PidFile -Raw).Trim()
    $ParsedProcessId = 0
    if (-not [int]::TryParse($Raw, [ref]$ParsedProcessId)) {
        return $null
    }

    return Get-Process -Id $ParsedProcessId -ErrorAction SilentlyContinue
}

function Test-IsExpectedTunnelClient {
    param(
        [Parameter(Mandatory=$true)]$Process
    )

    try {
        $Actual = [System.IO.Path]::GetFullPath($Process.Path)
        $Expected = [System.IO.Path]::GetFullPath($ExpectedTunnel)
        return [string]::Equals(
            $Actual,
            $Expected,
            [System.StringComparison]::OrdinalIgnoreCase
        )
    }
    catch {
        return $false
    }
}

$Running = @()

foreach ($PidFile in @($LauncherPidFile, $TunnelPidFile)) {
    $Process = Get-RecordedProcess -PidFile $PidFile
    if ($Process -and (Test-IsExpectedTunnelClient -Process $Process)) {
        $Running += $Process
    }
}

$Running = @($Running | Sort-Object Id -Unique)

if ($Running.Count -gt 0) {
    $Ids = ($Running | Select-Object -ExpandProperty Id) -join ', '
    throw "LConnect is still running (tunnel-client PID: $Ids). Run Stop-LConnect.cmd first, then run Refresh-LConnect.cmd again."
}

Write-Host 'LConnect offline refresh'
Write-Host "Root: $Root"
Write-Host ''

$Preserved = @(
    'mcp-conf.yaml',
    'lconnect-config.json',
    'tunnel-client.exe',
    'node_modules\',
    'source and documentation files'
)

if ($PSCmdlet.ShouldProcess($Runtime, 'Clear generated runtime state')) {
    if (Test-Path -LiteralPath $Runtime) {
        Get-ChildItem -LiteralPath $Runtime -Force -ErrorAction SilentlyContinue |
            Remove-Item -Recurse -Force -ErrorAction Stop
    }
    New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
    Write-Host 'runtime/: cleared'
}

if ($KeepLogs) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    Write-Host 'logs/: preserved (-KeepLogs)'
}
elseif ($PSCmdlet.ShouldProcess($LogDir, 'Clear generated logs')) {
    if (Test-Path -LiteralPath $LogDir) {
        Get-ChildItem -LiteralPath $LogDir -Force -ErrorAction SilentlyContinue |
            Remove-Item -Recurse -Force -ErrorAction Stop
    }
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    Write-Host 'logs/: cleared'
}

Write-Host ''
Write-Host 'Preserved:'
foreach ($Item in $Preserved) {
    Write-Host "  - $Item"
}
Write-Host ''
Write-Host 'Refresh complete. LConnect remains stopped.'
Write-Host 'Run Start-LConnect.cmd when you want to start it again.'
