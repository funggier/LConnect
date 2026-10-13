$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$Fixture = Join-Path ([IO.Path]::GetTempPath()) ('lconnect-operator-cmd-' + [Guid]::NewGuid().ToString('N'))
$FixtureScripts = Join-Path $Fixture 'scripts'

try {
    New-Item -ItemType Directory -Force -Path $FixtureScripts | Out-Null

    Copy-Item -LiteralPath (Join-Path $Root 'Status-LConnect.cmd') -Destination (Join-Path $Fixture 'Status-LConnect.cmd')
    Copy-Item -LiteralPath (Join-Path $Root 'Stop-LConnect.cmd') -Destination (Join-Path $Fixture 'Stop-LConnect.cmd')
    Copy-Item -LiteralPath (Join-Path $Root 'scripts\Hold-LConnectConsole.ps1') -Destination (Join-Path $FixtureScripts 'Hold-LConnectConsole.ps1')

    @'
Write-Host "STATUS_FIXTURE_OK"
exit 7
'@ | Set-Content -LiteralPath (Join-Path $Fixture 'Status-LConnect.ps1') -Encoding UTF8

    @'
Write-Host "STOP_FIXTURE_OK"
exit 0
'@ | Set-Content -LiteralPath (Join-Path $Fixture 'Stop-LConnect.ps1') -Encoding UTF8

    $StatusCommand = '"' + (Join-Path $Fixture 'Status-LConnect.cmd') + '" --no-hold'
    $StatusNoHold = & cmd.exe /d /c $StatusCommand 2>&1
    $StatusCode = $LASTEXITCODE
    if ($StatusCode -ne 7) {
        throw "Status --no-hold did not preserve PowerShell exit code 7 (got $StatusCode)."
    }
    if (($StatusNoHold | Out-String) -notmatch 'STATUS_FIXTURE_OK') {
        throw 'Status --no-hold did not execute the fixture PowerShell script.'
    }

    $StopCommand = '"' + (Join-Path $Fixture 'Stop-LConnect.cmd') + '" --no-hold'
    $StopNoHold = & cmd.exe /d /c $StopCommand 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Stop --no-hold failed with exit code $LASTEXITCODE."
    }
    if (($StopNoHold | Out-String) -notmatch 'STOP_FIXTURE_OK') {
        throw 'Stop --no-hold did not execute the fixture PowerShell script.'
    }

    $Hold = Start-Process -FilePath (Join-Path $Fixture 'Status-LConnect.cmd') -PassThru -WindowStyle Hidden
    Start-Sleep -Milliseconds 3500
    if ($Hold.HasExited) {
        throw "Default Status wrapper exited before the hold boundary kept the result visible (exit=$($Hold.ExitCode))."
    }
    Stop-Process -Id $Hold.Id -Force -ErrorAction SilentlyContinue
    $Hold.WaitForExit(3000) | Out-Null

    $HelperOutput = & powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $FixtureScripts 'Hold-LConnectConsole.ps1') -MinimumSeconds 0 -FallbackSeconds 1 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Hold helper redirected-input fallback failed with exit code $LASTEXITCODE."
    }
    if (($HelperOutput | Out-String) -notmatch 'keeping this result visible') {
        throw 'Hold helper did not report the redirected-input fallback path.'
    }

    foreach ($Name in @('Status-LConnect.cmd', 'Stop-LConnect.cmd')) {
        $Text = Get-Content -LiteralPath (Join-Path $Root $Name) -Raw
        if ($Text -notmatch '--no-hold') {
            throw "$Name does not expose the automation-safe --no-hold path."
        }
        if ($Text -notmatch 'Hold-LConnectConsole\.ps1') {
            throw "$Name is not wired to Hold-LConnectConsole.ps1."
        }
        if ($Text -match '(?im)^\s*pause\s*$') {
            throw "$Name still contains the fragile plain pause boundary."
        }
    }

    Write-Host 'Status CMD --no-hold / exit-code preservation: PASS'
    Write-Host 'Stop CMD --no-hold: PASS'
    Write-Host 'default wrapper visible-hold boundary: PASS'
    Write-Host 'redirected-input fallback hold: PASS'
    Write-Host 'plain pause removed from Status/Stop wrappers: PASS'
}
finally {
    if (Test-Path -LiteralPath $Fixture) {
        Remove-Item -LiteralPath $Fixture -Recurse -Force -ErrorAction SilentlyContinue
    }
}
