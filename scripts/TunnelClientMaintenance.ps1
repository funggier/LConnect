$script:LConnectMinimumTunnelClientVersion = [version]'0.0.14'

function Get-LConnectTunnelClientVersion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ClientPath
    )

    if (-not (Test-Path -LiteralPath $ClientPath)) {
        return $null
    }

    $Raw = (& $ClientPath --version 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to read tunnel-client version from $ClientPath."
    }

    if ($Raw -notmatch '^(?<version>\d+\.\d+\.\d+)') {
        throw "Unrecognized tunnel-client version output: $Raw"
    }

    [pscustomobject]@{
        Version = [version]$Matches.version
        Raw = $Raw
    }
}

function Assert-LConnectTunnelClientVersion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ClientPath
    )

    $Info = Get-LConnectTunnelClientVersion -ClientPath $ClientPath
    if (-not $Info) {
        throw "Missing tunnel-client: $ClientPath. Run Install-LConnect.cmd or Update-TunnelClient.cmd."
    }

    if ($Info.Version -lt $script:LConnectMinimumTunnelClientVersion) {
        throw (
            "Unsupported tunnel-client $($Info.Version). " +
            "LConnect requires $($script:LConnectMinimumTunnelClientVersion) or newer because older stdio runtimes can fail to recover after response timeouts. " +
            "Stop LConnect, then run Update-TunnelClient.cmd."
        )
    }

    return $Info
}

function Install-LConnectTunnelClient {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Root,

        [string]$TunnelClientVersion = 'latest'
    )

    $Client = Join-Path $Root 'tunnel-client.exe'
    $State = Join-Path $Root 'runtime\launcher.pid'

    if (Test-Path -LiteralPath $State) {
        $ExistingId = (Get-Content -LiteralPath $State -Raw).Trim()
        $Existing = Get-Process -Id $ExistingId -ErrorAction SilentlyContinue
        if ($Existing) {
            throw "LConnect is running (PID $ExistingId). Stop it before updating tunnel-client."
        }
    }

    $Headers = @{ 'User-Agent' = 'LConnect-TunnelClient-Updater' }

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

    $TempRoot = Join-Path ([IO.Path]::GetTempPath()) ("lconnect-tunnel-client-" + [guid]::NewGuid().ToString('N'))
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

        $DownloadedInfo = Get-LConnectTunnelClientVersion -ClientPath $DownloadedClient.FullName
        if ($DownloadedInfo.Version -lt $script:LConnectMinimumTunnelClientVersion) {
            throw "Downloaded tunnel-client $($DownloadedInfo.Version) is older than required $($script:LConnectMinimumTunnelClientVersion)."
        }

        Copy-Item -LiteralPath $DownloadedClient.FullName -Destination $Client -Force

        $InstalledInfo = Assert-LConnectTunnelClientVersion -ClientPath $Client
        New-Item -ItemType Directory -Force -Path (Join-Path $Root 'runtime') | Out-Null
        Set-Content -LiteralPath (Join-Path $Root 'runtime\tunnel-client-version.txt') -Value $InstalledInfo.Raw -Encoding ASCII

        Write-Host "Installed tunnel-client $($InstalledInfo.Raw)"
        return $InstalledInfo
    }
    finally {
        Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
