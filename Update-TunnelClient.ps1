[CmdletBinding()]
param(
    [string]$TunnelClientVersion = 'latest'
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Maintenance = Join-Path $Root 'scripts\TunnelClientMaintenance.ps1'

if (-not (Test-Path -LiteralPath $Maintenance)) {
    throw "Missing maintenance script: $Maintenance"
}

. $Maintenance

$Info = Install-LConnectTunnelClient -Root $Root -TunnelClientVersion $TunnelClientVersion
Write-Host ''
Write-Host "Tunnel client update complete: $($Info.Raw)"
Write-Host 'Tunnel configuration was not created or modified.'
