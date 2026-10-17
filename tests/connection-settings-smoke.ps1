$ErrorActionPreference = 'Stop'
$SourceRoot = Split-Path -Parent $PSScriptRoot
$Helper = Join-Path $SourceRoot 'scripts\ConnectionSettings.ps1'
$TempRoot = Join-Path $env:TEMP ('lconnect-connection-settings-smoke-' + [Guid]::NewGuid().ToString('N'))

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

try {
    New-Item -ItemType Directory -Force -Path $TempRoot | Out-Null
    Assert-True (Test-Path -LiteralPath $Helper -PathType Leaf) 'ConnectionSettings helper is missing'
    . $Helper

    $TunnelId = 'tunnel_test_connection_settings'
    $OrganizationId = 'org-test-connection-settings'
    $HealthPort = 18123

    $Saved = Save-LConnectConnectionSettings -Root $TempRoot -TunnelId $TunnelId -OrganizationId $OrganizationId -HealthPort $HealthPort
    Assert-True $Saved.saved 'connection settings save failed'
    Assert-True (Test-Path -LiteralPath $Saved.path -PathType Leaf) 'settings file missing after save'

    $Settings = Get-LConnectConnectionSettings -Root $TempRoot
    Assert-True ($Settings.tunnel_id -eq $TunnelId) 'Tunnel ID round-trip mismatch'
    Assert-True ($Settings.organization_id -eq $OrganizationId) 'Organization ID round-trip mismatch'
    Assert-True ([int]$Settings.health_port -eq $HealthPort) 'health port round-trip mismatch'
    Write-Host 'connection settings round-trip: PASS'

    $Profile = Write-LConnectProfile -Root $TempRoot
    $Yaml = Get-Content -LiteralPath $Profile -Raw
    Assert-True ($Yaml -match [regex]::Escape($TunnelId)) 'generated profile missing Tunnel ID'
    Assert-True ($Yaml -match 'env:CONTROL_PLANE_API_KEY') 'generated profile must use API key environment indirection'
    Assert-True ($Yaml -match ('127\.0\.0\.1:' + $HealthPort)) 'generated profile missing health port'
    Assert-True ($Yaml -match 'lconnect-mcp\.mjs') 'generated profile missing LConnect MCP command'
    Assert-True ($Yaml -notmatch [regex]::Escape($OrganizationId)) 'Organization ID should not be written into profile'
    Write-Host 'generated local profile: PASS'

    $Removed = Remove-LConnectConnectionSettings -Root $TempRoot
    Assert-True $Removed.settings_removed 'settings file was not removed'
    Assert-True $Removed.profile_removed 'profile file was not removed'
    Assert-True (-not (Test-Path -LiteralPath $Saved.path)) 'settings file still exists after clear'
    Assert-True (-not (Test-Path -LiteralPath $Profile)) 'profile file still exists after clear'
    Write-Host 'connection settings clear: PASS'
}
finally {
    Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
