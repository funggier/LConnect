[CmdletBinding()]
param(
    [string]$ApiKey,
    [string]$OrganizationId,
    [switch]$DisableExecution,
    [switch]$NonInteractive,
    [switch]$NoCredentialSave
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Client = Join-Path $Root 'tunnel-client.exe'
$Runtime = Join-Path $Root 'runtime'
$LogDir = Join-Path $Root 'logs'
$State = Join-Path $Runtime 'launcher.pid'
$Maintenance = Join-Path $Root 'scripts\TunnelClientMaintenance.ps1'
$CredentialHelper = Join-Path $Root 'scripts\SecureCredential.ps1'
$ConnectionHelper = Join-Path $Root 'scripts\ConnectionSettings.ps1'
$SetupScript = Join-Path $Root 'Setup-LConnect.ps1'

foreach ($Required in @($Maintenance, $CredentialHelper, $ConnectionHelper, $SetupScript)) {
    if (-not (Test-Path -LiteralPath $Required -PathType Leaf)) {
        throw "Missing LConnect helper: $Required"
    }
}
. $Maintenance
. $CredentialHelper
. $ConnectionHelper

if (-not (Test-Path -LiteralPath $Client)) { throw "Missing tunnel client: $Client. Run Install-LConnect.cmd first." }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'node was not found. Install Node.js LTS.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm was not found. Install Node.js LTS.' }

$TunnelClientInfo = Assert-LConnectTunnelClientVersion -ClientPath $Client
Write-Host "Tunnel client: $($TunnelClientInfo.Raw)"

if (-not (Test-Path -LiteralPath (Join-Path $Root 'node_modules\@modelcontextprotocol\sdk'))) {
    Write-Host 'Installing local MCP dependencies...'
    & npm install --omit=dev --prefix $Root
    if ($LASTEXITCODE -ne 0) { throw "npm install failed (exit $LASTEXITCODE)." }
}

New-Item -ItemType Directory -Force -Path $Runtime, $LogDir | Out-Null

if (Test-Path -LiteralPath $State) {
    $ExistingId = (Get-Content -LiteralPath $State -Raw).Trim()
    $Existing = Get-Process -Id $ExistingId -ErrorAction SilentlyContinue
    if ($Existing) { Write-Host "LConnect is already running (PID $ExistingId)."; exit 0 }
    Remove-Item -LiteralPath $State -Force
}

$ConnectionSettings = Get-LConnectConnectionSettings -Root $Root

# One-time compatibility migration for installations that predate separated
# connection settings. Import Tunnel ID/port from mcp-conf.yaml and Organization
# ID from the legacy encrypted credential when both are available.
if (-not $ConnectionSettings) {
    $Legacy = Read-LConnectLegacyProfileConnection -Root $Root
    $CredentialStatus = Get-LConnectCredentialStatus -Root $Root
    if ($Legacy -and $CredentialStatus.exists -and $CredentialStatus.decrypt_pass -and $CredentialStatus.organization_id_configured) {
        $StoredLegacy = Read-LConnectStoredCredential -Root $Root
        Save-LConnectConnectionSettings -Root $Root -TunnelId ([string]$Legacy.tunnel_id) -OrganizationId ([string]$StoredLegacy.OrganizationId) -HealthPort ([int]$Legacy.health_port) | Out-Null
        # Convert the old combined credential to API-key-only after migration.
        Write-LConnectStoredCredential -Root $Root -RuntimeApiKey ([string]$StoredLegacy.RuntimeApiKey) | Out-Null
        Remove-Variable StoredLegacy -ErrorAction SilentlyContinue
        $ConnectionSettings = Get-LConnectConnectionSettings -Root $Root
        Write-Host 'Migrated legacy tunnel profile/credential into separated local connection settings.'
    }
}

if (-not $ConnectionSettings) {
    if ($NonInteractive) {
        throw 'CONNECTION_SETTINGS_NOT_CONFIGURED: Tunnel ID, Organization ID, and health port are unavailable. Run Setup-LConnect.cmd first.'
    }

    Write-Host 'One or more LConnect connection values are missing.'
    Write-Host 'Only missing values will be requested; saved values will be reused.'
    & $SetupScript -FillMissing
    if ($LASTEXITCODE -ne 0) { throw "Setup failed (exit $LASTEXITCODE)." }
    $ConnectionSettings = Get-LConnectConnectionSettings -Root $Root
}

if (-not $ConnectionSettings) {
    throw 'CONNECTION_SETTINGS_NOT_CONFIGURED: Connection setup is incomplete.'
}

$Profile = Write-LConnectProfile -Root $Root
$ResolvedOrganizationId = if (-not [string]::IsNullOrWhiteSpace($OrganizationId)) {
    [string]$OrganizationId
}
else {
    [string]$ConnectionSettings.organization_id
}

$PreviousApiKeyEnvironment = [Environment]::GetEnvironmentVariable('CONTROL_PLANE_API_KEY', 'Process')
$PreviousOrganizationEnvironment = [Environment]::GetEnvironmentVariable('CONTROL_PLANE_ORGANIZATION_ID', 'Process')
$PreviousExecutionEnvironment = [Environment]::GetEnvironmentVariable('MCP_ENABLE_POWERSHELL', 'Process')
$ResolvedCredential = $null

try {
    $ResolvedCredential = Resolve-LConnectCredential -Root $Root -ApiKey $ApiKey -OrganizationId $ResolvedOrganizationId -NonInteractive:$NonInteractive -NoCredentialSave:$NoCredentialSave
    $ApiKey = $ResolvedCredential.RuntimeApiKey
    $ResolvedOrganizationId = $ResolvedCredential.OrganizationId

    $OrganizationSource = if (-not [string]::IsNullOrWhiteSpace($OrganizationId)) { 'parameter' } else { 'connection-settings' }
    Write-Host "Credential source: Runtime API key=$($ResolvedCredential.ApiKeySource); Organization ID=$OrganizationSource"
    if ($ResolvedCredential.StoredDuringResolution) {
        Write-Host 'Encrypted Runtime API key saved to local-secrets\credentials.json.enc for future non-interactive start/restart.'
    }

    $env:CONTROL_PLANE_API_KEY = $ApiKey
    $env:CONTROL_PLANE_ORGANIZATION_ID = $ResolvedOrganizationId
    $env:MCP_ENABLE_POWERSHELL = if ($DisableExecution) { 'false' } else { 'true' }

    Push-Location -LiteralPath $Root
    try {
        & $Client doctor --profile-file $Profile --control-plane.organization-id $ResolvedOrganizationId --pid.file (Join-Path $Runtime 'tunnel-client.pid') --explain 2>&1 | Tee-Object -FilePath (Join-Path $LogDir 'doctor-latest.log')
        $DoctorExitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    if ($DoctorExitCode -ne 0) {
        throw "Configuration check failed (exit $DoctorExitCode). See logs\doctor-latest.log."
    }

    $Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $Arguments = @('run', '--profile-file', $Profile, '--control-plane.organization-id', $ResolvedOrganizationId, '--pid.file', (Join-Path $Runtime 'tunnel-client.pid'))
    $Process = Start-Process -FilePath $Client -WorkingDirectory $Root -ArgumentList $Arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $LogDir "tunnel-$Stamp.out.log") -RedirectStandardError (Join-Path $LogDir "tunnel-$Stamp.err.log")
    Set-Content -LiteralPath $State -Value $Process.Id -NoNewline
}
finally {
    if ($null -eq $PreviousApiKeyEnvironment) { Remove-Item Env:CONTROL_PLANE_API_KEY -ErrorAction SilentlyContinue } else { $env:CONTROL_PLANE_API_KEY = $PreviousApiKeyEnvironment }
    if ($null -eq $PreviousOrganizationEnvironment) { Remove-Item Env:CONTROL_PLANE_ORGANIZATION_ID -ErrorAction SilentlyContinue } else { $env:CONTROL_PLANE_ORGANIZATION_ID = $PreviousOrganizationEnvironment }
    if ($null -eq $PreviousExecutionEnvironment) { Remove-Item Env:MCP_ENABLE_POWERSHELL -ErrorAction SilentlyContinue } else { $env:MCP_ENABLE_POWERSHELL = $PreviousExecutionEnvironment }
    Remove-Variable ApiKey, OrganizationId, ResolvedOrganizationId, ResolvedCredential -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2
if (-not (Get-Process -Id $Process.Id -ErrorAction SilentlyContinue)) {
    Remove-Item -LiteralPath $State -Force -ErrorAction SilentlyContinue
    throw 'LConnect exited during startup. Check the newest logs\tunnel-*.err.log file.'
}

$Mode = if ($DisableExecution) { 'filesystem + system information (execution disabled)' } else { 'FULL CONTROL: filesystem + shell + process + system' }
Write-Host "LConnect started (PID $($Process.Id), $Mode)."
Write-Host "Tunnel ID: $($ConnectionSettings.tunnel_id)"
Write-Host "Organization ID: $($ConnectionSettings.organization_id)"
Write-Host "Health port: $($ConnectionSettings.health_port)"
Write-Host 'Run Status-LConnect.cmd to check readiness.'
