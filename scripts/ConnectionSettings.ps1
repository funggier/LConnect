$script:LConnectConnectionSettingsVersion = 1

function Get-LConnectConnectionPaths {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$Root)

    $LocalSecrets = Join-Path $Root 'local-secrets'
    [pscustomobject]@{
        Root = $Root
        LocalSecrets = $LocalSecrets
        SettingsFile = Join-Path $LocalSecrets 'lconnect-settings.json'
        ProfileFile = Join-Path $Root 'mcp-conf.yaml'
    }
}

function Test-LConnectPortAvailable {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][int]$Port)

    try {
        $Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $Listener.Start()
        $Listener.Stop()
        return $true
    }
    catch {
        try { if ($Listener) { $Listener.Stop() } } catch {}
        return $false
    }
}

function Get-LConnectConnectionSettings {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$Root)

    $p = Get-LConnectConnectionPaths -Root $Root
    if (-not (Test-Path -LiteralPath $p.SettingsFile -PathType Leaf)) {
        return $null
    }

    try {
        $Settings = Get-Content -LiteralPath $p.SettingsFile -Raw | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        throw "CONNECTION_SETTINGS_INVALID: Could not parse $($p.SettingsFile). $($_.Exception.Message)"
    }

    if ([string]::IsNullOrWhiteSpace([string]$Settings.tunnel_id) -or
        [string]::IsNullOrWhiteSpace([string]$Settings.organization_id) -or
        [int]$Settings.health_port -lt 1024 -or
        [int]$Settings.health_port -gt 65535) {
        throw 'CONNECTION_SETTINGS_INVALID: Tunnel ID, Organization ID, or health port is invalid.'
    }

    return $Settings
}

function Save-LConnectConnectionSettings {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][string]$Root,
        [Parameter(Mandatory=$true)][string]$TunnelId,
        [Parameter(Mandatory=$true)][string]$OrganizationId,
        [Parameter(Mandatory=$true)][ValidateRange(1024,65535)][int]$HealthPort
    )

    if ([string]::IsNullOrWhiteSpace($TunnelId)) {
        throw 'CONNECTION_SETTINGS_INVALID: Tunnel ID is empty.'
    }
    if ([string]::IsNullOrWhiteSpace($OrganizationId)) {
        throw 'CONNECTION_SETTINGS_INVALID: Organization ID is empty.'
    }

    $p = Get-LConnectConnectionPaths -Root $Root
    New-Item -ItemType Directory -Force -Path $p.LocalSecrets | Out-Null

    $Obj = [ordered]@{
        version = $script:LConnectConnectionSettingsVersion
        tunnel_id = $TunnelId
        organization_id = $OrganizationId
        health_port = $HealthPort
        updated_at = [DateTimeOffset]::UtcNow.ToString('o')
    }

    $Utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($p.SettingsFile, (($Obj | ConvertTo-Json) + [Environment]::NewLine), $Utf8)

    return [pscustomobject]@{
        saved = $true
        path = $p.SettingsFile
        tunnel_id = $TunnelId
        organization_id = $OrganizationId
        health_port = $HealthPort
    }
}

function Read-LConnectLegacyProfileConnection {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$Root)

    $p = Get-LConnectConnectionPaths -Root $Root
    if (-not (Test-Path -LiteralPath $p.ProfileFile -PathType Leaf)) {
        return $null
    }

    $Text = Get-Content -LiteralPath $p.ProfileFile -Raw
    $TunnelMatch = [regex]::Match($Text, '(?m)^\s*tunnel_id:\s*["'']?([^"''\r\n#]+)')
    $PortMatch = [regex]::Match($Text, '(?m)^\s*listen_addr:\s*["'']?127\.0\.0\.1:(\d+)')

    if (-not $TunnelMatch.Success -or -not $PortMatch.Success) {
        return $null
    }

    [pscustomobject]@{
        tunnel_id = $TunnelMatch.Groups[1].Value.Trim()
        health_port = [int]$PortMatch.Groups[1].Value
        profile_file = $p.ProfileFile
    }
}

function Write-LConnectProfile {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$Root)

    $Settings = Get-LConnectConnectionSettings -Root $Root
    if (-not $Settings) {
        throw 'CONNECTION_SETTINGS_NOT_CONFIGURED: Run Setup-LConnect.cmd first.'
    }

    $p = Get-LConnectConnectionPaths -Root $Root
    $Yaml = @"
# Local MCP tunnel profile generated from local-secrets\lconnect-settings.json.
# Runtime API key and Organization ID are supplied at process start.
config_version: 1

control_plane:
  base_url: "https://api.openai.com"
  tunnel_id: "$($Settings.tunnel_id)"
  api_key: "env:CONTROL_PLANE_API_KEY"

health:
  listen_addr: "127.0.0.1:$($Settings.health_port)"
  url_file: "runtime/health-url.txt"

admin_ui:
  open_browser: false

log:
  level: info
  format: json

mcp:
  commands:
    - channel: main
      command: 'node "lconnect-mcp.mjs"'
"@

    $Utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($p.ProfileFile, $Yaml + [Environment]::NewLine, $Utf8)
    return $p.ProfileFile
}

function Remove-LConnectConnectionSettings {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$Root)

    $p = Get-LConnectConnectionPaths -Root $Root
    $SettingsRemoved = $false
    $ProfileRemoved = $false

    if (Test-Path -LiteralPath $p.SettingsFile -PathType Leaf) {
        Remove-Item -LiteralPath $p.SettingsFile -Force
        $SettingsRemoved = $true
    }
    if (Test-Path -LiteralPath $p.ProfileFile -PathType Leaf) {
        Remove-Item -LiteralPath $p.ProfileFile -Force
        $ProfileRemoved = $true
    }

    [pscustomobject]@{
        settings_removed = $SettingsRemoved
        profile_removed = $ProfileRemoved
        settings_file = $p.SettingsFile
        profile_file = $p.ProfileFile
    }
}
