[CmdletBinding()]
param(
    [string]$TunnelClientVersion = 'latest',
    [switch]$SkipTunnelClientDownload
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Client = Join-Path $Root 'tunnel-client.exe'
$Maintenance = Join-Path $Root 'scripts\TunnelClientMaintenance.ps1'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js was not found. Install Node.js LTS first.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm was not found. Install Node.js LTS first.'
}
if (-not (Test-Path -LiteralPath $Maintenance)) {
    throw "Missing maintenance script: $Maintenance"
}

. $Maintenance

Write-Host 'Installing Node dependencies...'
& npm install --omit=dev --prefix $Root
if ($LASTEXITCODE -ne 0) {
    throw "npm install failed (exit $LASTEXITCODE)."
}

New-Item -ItemType Directory -Force -Path (Join-Path $Root 'runtime'), (Join-Path $Root 'logs') | Out-Null

if (-not $SkipTunnelClientDownload) {
    Install-LConnectTunnelClient -Root $Root -TunnelClientVersion $TunnelClientVersion | Out-Null
}
else {
    Assert-LConnectTunnelClientVersion -ClientPath $Client | Out-Null
}

Write-Host ''
Write-Host 'LConnect installation completed.'
Write-Host 'No tunnel configuration was created or changed.'
Write-Host 'Create and maintain your tunnel configuration locally; mcp-conf.yaml is intentionally ignored by Git.'
Write-Host "Required tunnel-client: $script:LConnectMinimumTunnelClientVersion or newer."
Write-Host 'Default LConnect access mode is full-machine access with shell/process execution enabled.'
Write-Host ''
Write-Host 'FIRST-RUN NEXT STEP:'
Write-Host '  Open docs\INSTALLATION_TH.md and follow Step 4 onward.'
Write-Host '  You must create mcp-conf.yaml locally before Start-LConnect.cmd can run.'
Write-Host '  The guide explains Tunnel ID, Runtime API key, Organization ID and every profile/config value.'
