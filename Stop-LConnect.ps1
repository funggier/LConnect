[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Runtime = Join-Path $Root 'runtime'
$State = Join-Path $Runtime 'launcher.pid'
$Expected = Join-Path $Root 'tunnel-client.exe'

if (-not (Test-Path -LiteralPath $State)) {
    Write-Host 'LConnect is not running.'
    exit 0
}

$Id = (Get-Content -LiteralPath $State -Raw).Trim()
$Process = Get-Process -Id $Id -ErrorAction SilentlyContinue
if (-not $Process) {
    Remove-Item -LiteralPath $State -Force
    Write-Host 'Removed stale PID file.'
    exit 0
}

$Actual = $Process.Path
if ($Actual -ne $Expected) {
    throw "Refusing to stop PID $Id because it is not this LConnect tunnel client."
}

Stop-Process -Id $Id
Start-Sleep -Milliseconds 500
Remove-Item -LiteralPath $State -Force -ErrorAction SilentlyContinue
Write-Host "LConnect stopped (PID $Id)."
