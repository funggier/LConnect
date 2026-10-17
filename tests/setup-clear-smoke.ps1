$ErrorActionPreference = 'Stop'
$SourceRoot = Split-Path -Parent $PSScriptRoot
$TempRoot = Join-Path $env:TEMP ('lconnect-setup-clear-smoke-' + [Guid]::NewGuid().ToString('N'))

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function Get-FreePort {
    $Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $Listener.Start()
    try { return ([System.Net.IPEndPoint]$Listener.LocalEndpoint).Port }
    finally { $Listener.Stop() }
}

try {
    New-Item -ItemType Directory -Force -Path (Join-Path $TempRoot 'scripts') | Out-Null
    foreach ($Name in @('Setup-LConnect.ps1','Clear-LConnectSettings.ps1')) {
        Copy-Item -LiteralPath (Join-Path $SourceRoot $Name) -Destination (Join-Path $TempRoot $Name)
    }
    foreach ($Name in @('SecureCredential.ps1','ConnectionSettings.ps1')) {
        Copy-Item -LiteralPath (Join-Path $SourceRoot ('scripts\' + $Name)) -Destination (Join-Path $TempRoot ('scripts\' + $Name))
    }

    $TunnelId = 'tunnel-setup-clear-smoke'
    $OrganizationId = 'org-setup-clear-smoke'
    $ApiKey = 'synthetic-api-key-setup-clear-smoke'
    $Port = Get-FreePort

    & (Join-Path $TempRoot 'Setup-LConnect.ps1') -TunnelId $TunnelId -ApiKey $ApiKey -OrganizationId $OrganizationId -HealthPort $Port -Force | Out-Null

    . (Join-Path $TempRoot 'scripts\ConnectionSettings.ps1')
    . (Join-Path $TempRoot 'scripts\SecureCredential.ps1')

    $Settings = Get-LConnectConnectionSettings -Root $TempRoot
    Assert-True ($Settings.tunnel_id -eq $TunnelId) 'Setup did not persist Tunnel ID'
    Assert-True ($Settings.organization_id -eq $OrganizationId) 'Setup did not persist Organization ID'
    Assert-True ([int]$Settings.health_port -eq $Port) 'Setup did not persist health port'
    Assert-True (Test-Path -LiteralPath (Join-Path $TempRoot 'mcp-conf.yaml')) 'Setup did not generate profile'

    $Stored = Read-LConnectStoredCredential -Root $TempRoot
    Assert-True ($Stored.RuntimeApiKey -eq $ApiKey) 'Setup API key round-trip mismatch'
    Assert-True ([string]::IsNullOrWhiteSpace([string]$Stored.OrganizationId)) 'Setup should store API-key-only credential'
    Write-Host 'setup script separated settings/credential: PASS'

    & (Join-Path $TempRoot 'Clear-LConnectSettings.ps1') -Mode connection -Force | Out-Null
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $TempRoot 'local-secrets\lconnect-settings.json'))) 'connection clear left settings file'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $TempRoot 'mcp-conf.yaml'))) 'connection clear left profile'
    $AfterConnectionClear = Get-LConnectCredentialStatus -Root $TempRoot
    Assert-True $AfterConnectionClear.decrypt_pass 'connection clear removed API key credential'
    Write-Host 'clear connection preserves API key: PASS'

    $Port2 = Get-FreePort
    & (Join-Path $TempRoot 'Setup-LConnect.ps1') -TunnelId ($TunnelId + '-2') -OrganizationId ($OrganizationId + '-2') -HealthPort $Port2 -FillMissing | Out-Null
    $Reused = Read-LConnectStoredCredential -Root $TempRoot
    Assert-True ($Reused.RuntimeApiKey -eq $ApiKey) 'FillMissing did not reuse encrypted API key'
    Write-Host 'fill-missing reuses API key: PASS'

    & (Join-Path $TempRoot 'Clear-LConnectSettings.ps1') -Mode credential -Force | Out-Null
    Assert-True (-not (Test-Path -LiteralPath (Get-LConnectCredentialPath -Root $TempRoot))) 'credential clear did not remove API key'
    Assert-True ($null -ne (Get-LConnectConnectionSettings -Root $TempRoot)) 'credential clear removed connection settings'
    Write-Host 'clear credential preserves connection settings: PASS'

    & (Join-Path $TempRoot 'Clear-LConnectSettings.ps1') -Mode all -Force | Out-Null
    Assert-True ($null -eq (Get-LConnectConnectionSettings -Root $TempRoot)) 'clear all left connection settings'
    Assert-True (-not (Test-Path -LiteralPath (Get-LConnectCredentialPath -Root $TempRoot))) 'clear all left credential'
    Assert-True (Test-Path -LiteralPath (Join-Path $TempRoot 'runtime') -PathType Container) 'clear all did not recreate runtime directory'
    Assert-True (Test-Path -LiteralPath (Join-Path $TempRoot 'logs') -PathType Container) 'clear all did not recreate logs directory'
    Write-Host 'clear all resets local connection/runtime state: PASS'

    $LegacySetupText = Get-Content -LiteralPath (Join-Path $SourceRoot 'Setup-LConnectCredential.ps1') -Raw
    Assert-True ($LegacySetupText -notmatch "Read-Host 'OpenAI Organization ID") 'credential-only setup still prompts for Organization ID'
    Assert-True ($LegacySetupText -match 'Write-LConnectStoredCredential -Root \$Root -RuntimeApiKey \$ApiKey') 'credential-only setup does not persist API key'
    Write-Host 'credential-only compatibility helper stays API-key-only: PASS'
}
finally {
    if (Test-Path -LiteralPath $TempRoot) {
        Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
