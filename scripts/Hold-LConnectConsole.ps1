[CmdletBinding()]
param(
    [ValidateRange(0,30)][int]$MinimumSeconds = 2,
    [ValidateRange(1,120)][int]$FallbackSeconds = 15
)

$ErrorActionPreference = 'Stop'

if ($MinimumSeconds -gt 0) {
    Start-Sleep -Seconds $MinimumSeconds
}

try {
    if ([Console]::IsInputRedirected) {
        throw 'Console input is redirected.'
    }

    while ([Console]::KeyAvailable) {
        [void][Console]::ReadKey($true)
    }

    Write-Host ''
    Write-Host 'Press any key to close this window...'
    [void][Console]::ReadKey($true)
}
catch {
    Write-Host ''
    Write-Host "Interactive console input is unavailable; keeping this result visible for $FallbackSeconds seconds..."
    Start-Sleep -Seconds $FallbackSeconds
}
