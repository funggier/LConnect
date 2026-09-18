[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

Push-Location -LiteralPath $Root
try {
    & npm run check
    if ($LASTEXITCODE -ne 0) { throw "npm run check failed (exit $LASTEXITCODE)." }

    & npm test
    if ($LASTEXITCODE -ne 0) { throw "npm test failed (exit $LASTEXITCODE)." }

    Write-Host 'LConnect validation: PASS'
}
finally {
    Pop-Location
}
