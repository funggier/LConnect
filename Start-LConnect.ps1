[CmdletBinding()]
param(
    [string]$ApiKey,
    [string]$OrganizationId,
    [switch]$DisableExecution
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Client = Join-Path $Root 'tunnel-client.exe'
$Profile = Join-Path $Root 'mcp-conf.yaml'
$Runtime = Join-Path $Root 'runtime'
$LogDir = Join-Path $Root 'logs'
$State = Join-Path $Runtime 'launcher.pid'

if (-not (Test-Path -LiteralPath $Client)) { throw "Missing tunnel client: $Client. Run Install-LConnect.cmd first." }
if (-not (Test-Path -LiteralPath $Profile)) { throw "Missing profile: $Profile. Run Install-LConnect.cmd first." }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'node was not found. Install Node.js LTS.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm was not found. Install Node.js LTS.' }

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

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    $Secure = Read-Host 'OpenAI Runtime API key (input is hidden)' -AsSecureString
    $Bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try { $ApiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Bstr) }
}
if ([string]::IsNullOrWhiteSpace($ApiKey)) { throw 'A Runtime API key is required.' }

if ([string]::IsNullOrWhiteSpace($OrganizationId)) {
    $OrganizationId = Read-Host 'OpenAI Organization ID (org_...)'
}
if ([string]::IsNullOrWhiteSpace($OrganizationId)) { throw 'An OpenAI Organization ID is required.' }

$env:CONTROL_PLANE_API_KEY = $ApiKey
$env:CONTROL_PLANE_ORGANIZATION_ID = $OrganizationId
$env:MCP_ENABLE_POWERSHELL = if ($DisableExecution) { 'false' } else { 'true' }

try {
    Push-Location -LiteralPath $Root
    try {
        & $Client doctor --profile-file $Profile --control-plane.organization-id $OrganizationId --pid.file (Join-Path $Runtime 'tunnel-client.pid') --explain 2>&1 | Tee-Object -FilePath (Join-Path $LogDir 'doctor-latest.log')
        $DoctorExitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    if ($DoctorExitCode -ne 0) {
        throw "Configuration check failed (exit $DoctorExitCode). See logs\doctor-latest.log."
    }

    $Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $Arguments = @('run', '--profile-file', $Profile, '--control-plane.organization-id', $OrganizationId, '--pid.file', (Join-Path $Runtime 'tunnel-client.pid'))
    $Process = Start-Process -FilePath $Client -WorkingDirectory $Root -ArgumentList $Arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $LogDir "tunnel-$Stamp.out.log") -RedirectStandardError (Join-Path $LogDir "tunnel-$Stamp.err.log")
    Set-Content -LiteralPath $State -Value $Process.Id -NoNewline
}
finally {
    Remove-Item Env:CONTROL_PLANE_API_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:CONTROL_PLANE_ORGANIZATION_ID -ErrorAction SilentlyContinue
    Remove-Item Env:MCP_ENABLE_POWERSHELL -ErrorAction SilentlyContinue
    Remove-Variable ApiKey -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2
if (-not (Get-Process -Id $Process.Id -ErrorAction SilentlyContinue)) {
    Remove-Item -LiteralPath $State -Force -ErrorAction SilentlyContinue
    throw 'LConnect exited during startup. Check the newest logs\tunnel-*.err.log file.'
}

$Mode = if ($DisableExecution) {
    'filesystem + system information (execution disabled)'
}
else {
    'FULL CONTROL: filesystem + shell + process + system'
}

Write-Host "LConnect started (PID $($Process.Id), $Mode)."
Write-Host 'Run Status-LConnect.cmd to check readiness.'
