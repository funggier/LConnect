[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Client = Join-Path $Root 'tunnel-client.exe'
$Runtime = Join-Path $Root 'runtime'
$State = Join-Path $Runtime 'launcher.pid'
$PidFile = Join-Path $Runtime 'tunnel-client.pid'
$UrlFile = Join-Path $Runtime 'health-url.txt'
$Maintenance = Join-Path $Root 'scripts\TunnelClientMaintenance.ps1'
$ExitCode = 0

if (-not (Test-Path -LiteralPath $Maintenance)) {
    Write-Host "Status: invalid installation (missing $Maintenance)"
    exit 10
}

. $Maintenance

$ClientInfo = $null
try {
    $ClientInfo = Get-LConnectTunnelClientVersion -ClientPath $Client
    if ($ClientInfo) {
        Write-Host "Tunnel client: $($ClientInfo.Raw)"
        if ($ClientInfo.Version -lt $script:LConnectMinimumTunnelClientVersion) {
            Write-Warning "Tunnel client $($ClientInfo.Version) is below the supported minimum $script:LConnectMinimumTunnelClientVersion."
            Write-Warning 'Older stdio runtimes can remain process-ready while MCP recovery is broken after a response timeout.'
            Write-Warning 'Run Stop-LConnect.cmd, then Update-TunnelClient.cmd, then Start-LConnect.cmd.'
            $ExitCode = [Math]::Max($ExitCode, 3)
        }
    }
    else {
        Write-Warning 'tunnel-client.exe is missing.'
        $ExitCode = [Math]::Max($ExitCode, 3)
    }
}
catch {
    Write-Warning "Unable to read tunnel-client version: $($_.Exception.Message)"
    $ExitCode = [Math]::Max($ExitCode, 3)
}

if (-not (Test-Path -LiteralPath $State)) {
    Write-Host 'Process: stopped'
    exit 1
}

$Id = (Get-Content -LiteralPath $State -Raw).Trim()
$Process = Get-Process -Id $Id -ErrorAction SilentlyContinue
if (-not $Process) {
    Write-Host "Process: stopped (stale PID $Id)"
    exit 1
}

Write-Host "Process: running (PID $Id)"

if (-not (Test-Path -LiteralPath $UrlFile)) {
    Write-Host 'Health URL: unavailable'
    exit 2
}

$Base = (Get-Content -LiteralPath $UrlFile -Raw).Trim().TrimEnd('/')

try {
    $Live = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri "$Base/healthz"
    Write-Host "Liveness: $($Live.StatusCode) $($Live.Content)"
}
catch {
    Write-Warning "Liveness probe failed: $($_.Exception.Message)"
    $ExitCode = [Math]::Max($ExitCode, 2)
}

try {
    $Ready = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri "$Base/readyz"
    Write-Host "Startup readiness: $($Ready.StatusCode) $($Ready.Content)"
}
catch {
    Write-Warning "Readiness probe failed: $($_.Exception.Message)"
    $ExitCode = [Math]::Max($ExitCode, 2)
}

if ((Test-Path -LiteralPath $Client) -and (Test-Path -LiteralPath $PidFile)) {
    try {
        $ProbeOutput = & $Client health --json --url-file $UrlFile --pid-file $PidFile --require-control-plane-poll 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host 'Control-plane health: PASS'
        }
        else {
            Write-Warning "Control-plane health failed: $($ProbeOutput | Out-String)"
            $ExitCode = [Math]::Max($ExitCode, 2)
        }
    }
    catch {
        Write-Warning "Control-plane health probe error: $($_.Exception.Message)"
        $ExitCode = [Math]::Max($ExitCode, 2)
    }
}

try {
    $Mcp = Invoke-RestMethod -UseBasicParsing -TimeoutSec 5 -Uri "$Base/health/mcp"

    $ChildState = $Mcp.details.child_state
    $InitializeOk = $Mcp.details.initialize.ok
    $ToolsOk = $Mcp.details.tools_list.ok
    $ToolsComplete = $Mcp.details.tools_list.complete

    Write-Host "MCP observed: status=$($Mcp.status) state=$($Mcp.state) child=$ChildState initialize_ok=$InitializeOk tools_ok=$ToolsOk tools_complete=$ToolsComplete observed_at=$($Mcp.observed_at)"

    if (
        $Mcp.status -ne 'ok' -or
        $Mcp.state -ne 'discovered' -or
        $ChildState -ne 'running' -or
        $InitializeOk -ne $true -or
        $ToolsOk -ne $true
    ) {
        Write-Warning 'MCP observed state is not fully healthy.'
        $ExitCode = [Math]::Max($ExitCode, 4)
    }
}
catch {
    $StatusCode = $null
    try { $StatusCode = [int]$_.Exception.Response.StatusCode } catch {}

    if ($StatusCode -eq 404) {
        Write-Warning 'MCP component health is unavailable in this tunnel-client version.'
        $ExitCode = [Math]::Max($ExitCode, 3)
    }
    else {
        Write-Warning "MCP component health probe failed: $($_.Exception.Message)"
        $ExitCode = [Math]::Max($ExitCode, 4)
    }
}

try {
    $Detailed = Invoke-RestMethod -UseBasicParsing -TimeoutSec 5 -Uri "$Base/health?details=true"
    foreach ($Name in @('control-plane', 'dispatcher', 'response-delivery')) {
        $Property = $Detailed.components.PSObject.Properties[$Name]
        if ($Property) {
            $Component = $Property.Value
            Write-Host "$Name observed: status=$($Component.status) state=$($Component.state) reason=$($Component.reason_code) observed_at=$($Component.observed_at)"
            if ($Component.status -eq 'degraded') {
                $ExitCode = [Math]::Max($ExitCode, 4)
            }
        }
    }
}
catch {
    # Older tunnel-client versions may not expose detailed health.
}

Write-Host 'Note: /readyz is startup readiness. MCP component health is observed protocol evidence, not an active tools/call probe.'

exit $ExitCode
