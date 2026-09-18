[CmdletBinding()]
param()

$Root = $PSScriptRoot
$Runtime = Join-Path $Root 'runtime'
$State = Join-Path $Runtime 'launcher.pid'
$UrlFile = Join-Path $Runtime 'health-url.txt'

if (-not (Test-Path -LiteralPath $State)) { Write-Host 'Status: stopped'; exit 1 }
$Id = (Get-Content -LiteralPath $State -Raw).Trim()
if (-not (Get-Process -Id $Id -ErrorAction SilentlyContinue)) {
    Write-Host "Status: stopped (stale PID $Id)"
    exit 1
}

Write-Host "Process: running (PID $Id)"

if (Test-Path -LiteralPath $UrlFile) {
    $Base = (Get-Content -LiteralPath $UrlFile -Raw).Trim().TrimEnd('/')
    try {
        $Ready = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri "$Base/readyz"
        Write-Host "Readiness: $($Ready.StatusCode) $($Ready.Content)"
        exit 0
    }
    catch {
        Write-Host "Readiness: not ready ($($_.Exception.Message))"
        exit 2
    }
}

Write-Host 'Readiness: waiting for health URL'
exit 2
