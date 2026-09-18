[CmdletBinding()]
param(
    [string]$TunnelClientVersion = 'latest',
    [switch]$SkipTunnelClientDownload
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Client = Join-Path $Root 'tunnel-client.exe'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js was not found. Install Node.js LTS first.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm was not found. Install Node.js LTS first.'
}

Write-Host 'Installing Node dependencies...'
& npm install --omit=dev --prefix $Root
if ($LASTEXITCODE -ne 0) {
    throw "npm install failed (exit $LASTEXITCODE)."
}

if (-not $SkipTunnelClientDownload) {
    Write-Host 'Finding the official OpenAI tunnel-client release...'
    $Headers = @{ 'User-Agent' = 'LConnect-Installer' }

    if ($TunnelClientVersion -eq 'latest') {
        $Release = Invoke-RestMethod -Headers $Headers -Uri 'https://api.github.com/repos/openai/tunnel-client/releases/latest'
    }
    else {
        $Tag = if ($TunnelClientVersion.StartsWith('v')) { $TunnelClientVersion } else { "v$TunnelClientVersion" }
        $Release = Invoke-RestMethod -Headers $Headers -Uri "https://api.github.com/repos/openai/tunnel-client/releases/tags/$Tag"
    }

    $Arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'amd64' }
    $Pattern = "^tunnel-client-v.*-windows-$Arch\.zip$"
    $Asset = $Release.assets | Where-Object { $_.name -match $Pattern } | Select-Object -First 1
    if (-not $Asset) {
        throw "Could not find a Windows $Arch tunnel-client asset in release $($Release.tag_name)."
    }

    $TempRoot = Join-Path ([IO.Path]::GetTempPath()) ("lconnect-install-" + [guid]::NewGuid().ToString('N'))
    $ZipPath = Join-Path $TempRoot $Asset.name
    $ExtractPath = Join-Path $TempRoot 'extract'
    New-Item -ItemType Directory -Force -Path $TempRoot, $ExtractPath | Out-Null

    try {
        Write-Host "Downloading $($Asset.name)..."
        Invoke-WebRequest -UseBasicParsing -Headers $Headers -Uri $Asset.browser_download_url -OutFile $ZipPath
        Expand-Archive -LiteralPath $ZipPath -DestinationPath $ExtractPath -Force

        $DownloadedClient = Get-ChildItem -LiteralPath $ExtractPath -Filter 'tunnel-client.exe' -Recurse | Select-Object -First 1
        if (-not $DownloadedClient) {
            throw 'The downloaded archive did not contain tunnel-client.exe.'
        }

        Copy-Item -LiteralPath $DownloadedClient.FullName -Destination $Client -Force
        Write-Host "Installed OpenAI tunnel-client $($Release.tag_name)."
    }
    finally {
        Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
elseif (-not (Test-Path -LiteralPath $Client)) {
    throw 'SkipTunnelClientDownload was used but tunnel-client.exe is not present.'
}

New-Item -ItemType Directory -Force -Path (Join-Path $Root 'runtime'), (Join-Path $Root 'logs') | Out-Null

Write-Host ''
Write-Host 'LConnect installation completed.'
Write-Host 'No tunnel configuration was created or changed.'
Write-Host 'Create and maintain your tunnel configuration locally; mcp-conf.yaml is intentionally ignored by Git.'
Write-Host 'Default LConnect access mode is full-machine access with shell/process execution enabled.'
