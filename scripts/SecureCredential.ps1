Set-StrictMode -Version Latest

$script:LConnectCredentialFormat = 'lconnect-secure-credential'
$script:LConnectCredentialVersion = 1
$script:LConnectCredentialProvider = 'windows-dpapi'
$script:LConnectCredentialScope = 'CurrentUser'
$script:LConnectCredentialRelativePath = 'local-secrets\credentials.json.enc'
$script:LConnectCredentialEntropyText = 'LConnect|SecureCredential|v1'

function Initialize-LConnectDpapi {
    try {
        Add-Type -AssemblyName System.Security -ErrorAction Stop
    }
    catch {
        throw "DPAPI_UNAVAILABLE: $($_.Exception.Message)"
    }

    if (-not ('System.Security.Cryptography.ProtectedData' -as [type])) {
        throw 'DPAPI_UNAVAILABLE: System.Security.Cryptography.ProtectedData is not available.'
    }
}

function Get-LConnectCredentialPath {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][string]$Root
    )

    return Join-Path $Root $script:LConnectCredentialRelativePath
}

function Get-LConnectSecretDirectory {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][string]$Root
    )

    return Join-Path $Root 'local-secrets'
}

function New-LConnectRestrictedDirectorySecurity {
    $Identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $UserSid = $Identity.User
    $SystemSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')

    $Acl = New-Object System.Security.AccessControl.DirectorySecurity
    $Acl.SetAccessRuleProtection($true, $false)

    foreach ($Sid in @($UserSid, $SystemSid)) {
        $Rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
            $Sid,
            [System.Security.AccessControl.FileSystemRights]::FullControl,
            [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',
            [System.Security.AccessControl.PropagationFlags]::None,
            [System.Security.AccessControl.AccessControlType]::Allow
        )
        [void]$Acl.AddAccessRule($Rule)
    }

    return $Acl
}

function Initialize-LConnectSecretDirectory {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][string]$Root
    )

    $Directory = Get-LConnectSecretDirectory -Root $Root
    New-Item -ItemType Directory -Force -Path $Directory | Out-Null

    try {
        [System.IO.Directory]::SetAccessControl($Directory, (New-LConnectRestrictedDirectorySecurity))
    }
    catch {
        throw "CREDENTIAL_ACL_FAILED: Could not restrict local-secrets ACL. $($_.Exception.Message)"
    }

    return $Directory
}

function Test-LConnectCredentialAcl {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $false
    }

    try {
        $CurrentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
        $Allowed = @($CurrentSid, 'S-1-5-18')

        $Directory = Split-Path -Parent $Path
        $DirectoryAcl = [System.IO.Directory]::GetAccessControl($Directory)
        if (-not $DirectoryAcl.AreAccessRulesProtected) {
            return $false
        }

        $DirectoryRules = @($DirectoryAcl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
        if ($DirectoryRules.Count -eq 0) {
            return $false
        }

        foreach ($Rule in $DirectoryRules) {
            if ($Rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {
                return $false
            }
            if ($Allowed -notcontains $Rule.IdentityReference.Value) {
                return $false
            }
        }

        $FileAcl = [System.IO.File]::GetAccessControl($Path)
        $FileRules = @($FileAcl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
        if ($FileRules.Count -eq 0) {
            return $false
        }

        foreach ($Rule in $FileRules) {
            if ($Rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {
                return $false
            }
            if ($Allowed -notcontains $Rule.IdentityReference.Value) {
                return $false
            }
        }

        return $true
    }
    catch {
        return $false
    }
}

function Write-LConnectStoredCredential {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][string]$Root,
        [Parameter(Mandatory=$true)][string]$RuntimeApiKey,
        [Parameter(Mandatory=$true)][string]$OrganizationId
    )

    if ([string]::IsNullOrWhiteSpace($RuntimeApiKey)) {
        throw 'CREDENTIAL_INVALID: Runtime API key is empty.'
    }
    if ([string]::IsNullOrWhiteSpace($OrganizationId)) {
        throw 'CREDENTIAL_INVALID: Organization ID is empty.'
    }

    Initialize-LConnectDpapi
    $Directory = Initialize-LConnectSecretDirectory -Root $Root
    $Path = Get-LConnectCredentialPath -Root $Root

    $Utf8 = New-Object System.Text.UTF8Encoding($false)
    $PlainBytes = $null
    $ProtectedBytes = $null
    $Entropy = $null

    try {
        $Payload = [ordered]@{
            runtime_api_key = $RuntimeApiKey
            organization_id = $OrganizationId
        }

        $PlainJson = $Payload | ConvertTo-Json -Compress
        $PlainBytes = $Utf8.GetBytes($PlainJson)
        $Entropy = $Utf8.GetBytes($script:LConnectCredentialEntropyText)

        $ProtectedBytes = [System.Security.Cryptography.ProtectedData]::Protect(
            $PlainBytes,
            $Entropy,
            [System.Security.Cryptography.DataProtectionScope]::CurrentUser
        )

        $Now = [DateTimeOffset]::UtcNow.ToString('o')
        $CreatedAt = $Now

        if (Test-Path -LiteralPath $Path -PathType Leaf) {
            try {
                $Existing = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json -ErrorAction Stop
                if ($Existing.created_at) {
                    $CreatedAt = [string]$Existing.created_at
                }
            }
            catch {
                $CreatedAt = $Now
            }
        }

        $Envelope = [ordered]@{
            format = $script:LConnectCredentialFormat
            version = $script:LConnectCredentialVersion
            provider = $script:LConnectCredentialProvider
            scope = $script:LConnectCredentialScope
            created_at = $CreatedAt
            updated_at = $Now
            ciphertext = [Convert]::ToBase64String($ProtectedBytes)
        }

        $Temp = Join-Path $Directory ("credentials.{0}.tmp" -f ([Guid]::NewGuid().ToString('N')))
        try {
            [System.IO.File]::WriteAllText($Temp, ($Envelope | ConvertTo-Json -Depth 4), $Utf8)
            Move-Item -LiteralPath $Temp -Destination $Path -Force
        }
        finally {
            Remove-Item -LiteralPath $Temp -Force -ErrorAction SilentlyContinue
        }

        return [pscustomobject]@{
            saved = $true
            path = $Path
            format = $script:LConnectCredentialFormat
            version = $script:LConnectCredentialVersion
            provider = $script:LConnectCredentialProvider
            scope = $script:LConnectCredentialScope
            acl_hardened = (Test-LConnectCredentialAcl -Path $Path)
        }
    }
    finally {
        if ($PlainBytes) { [Array]::Clear($PlainBytes, 0, $PlainBytes.Length) }
        if ($ProtectedBytes) { [Array]::Clear($ProtectedBytes, 0, $ProtectedBytes.Length) }
        if ($Entropy) { [Array]::Clear($Entropy, 0, $Entropy.Length) }
        Remove-Variable PlainJson, Payload -ErrorAction SilentlyContinue
    }
}

function Read-LConnectStoredCredential {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][string]$Root
    )

    $Path = Get-LConnectCredentialPath -Root $Root
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "CREDENTIAL_NOT_CONFIGURED: Encrypted credential file was not found at $Path"
    }

    Initialize-LConnectDpapi

    try {
        $Envelope = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        throw "CREDENTIAL_FORMAT_INVALID: Could not parse encrypted credential envelope. $($_.Exception.Message)"
    }

    if ([string]$Envelope.format -ne $script:LConnectCredentialFormat -or
        [int]$Envelope.version -ne $script:LConnectCredentialVersion -or
        [string]$Envelope.provider -ne $script:LConnectCredentialProvider -or
        [string]$Envelope.scope -ne $script:LConnectCredentialScope -or
        [string]::IsNullOrWhiteSpace([string]$Envelope.ciphertext)) {
        throw 'CREDENTIAL_FORMAT_INVALID: Unsupported encrypted credential envelope.'
    }

    $Utf8 = New-Object System.Text.UTF8Encoding($false)
    $ProtectedBytes = $null
    $PlainBytes = $null
    $Entropy = $null

    try {
        try {
            $ProtectedBytes = [Convert]::FromBase64String([string]$Envelope.ciphertext)
        }
        catch {
            throw "CREDENTIAL_FORMAT_INVALID: Ciphertext is not valid Base64. $($_.Exception.Message)"
        }

        $Entropy = $Utf8.GetBytes($script:LConnectCredentialEntropyText)

        try {
            $PlainBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
                $ProtectedBytes,
                $Entropy,
                [System.Security.Cryptography.DataProtectionScope]::CurrentUser
            )
        }
        catch {
            throw "CREDENTIAL_DECRYPT_FAILED: DPAPI could not decrypt this file for the current Windows user. Run Setup-LConnectCredential.cmd to replace it. $($_.Exception.Message)"
        }

        try {
            $Payload = $Utf8.GetString($PlainBytes) | ConvertFrom-Json -ErrorAction Stop
        }
        catch {
            throw "CREDENTIAL_FORMAT_INVALID: Decrypted credential payload is invalid. $($_.Exception.Message)"
        }

        if ([string]::IsNullOrWhiteSpace([string]$Payload.runtime_api_key) -or
            [string]::IsNullOrWhiteSpace([string]$Payload.organization_id)) {
            throw 'CREDENTIAL_FORMAT_INVALID: Decrypted credential payload is incomplete.'
        }

        return [pscustomobject]@{
            RuntimeApiKey = [string]$Payload.runtime_api_key
            OrganizationId = [string]$Payload.organization_id
            Path = $Path
            Format = [string]$Envelope.format
            Version = [int]$Envelope.version
            Provider = [string]$Envelope.provider
            Scope = [string]$Envelope.scope
            CreatedAt = [string]$Envelope.created_at
            UpdatedAt = [string]$Envelope.updated_at
        }
    }
    finally {
        if ($ProtectedBytes) { [Array]::Clear($ProtectedBytes, 0, $ProtectedBytes.Length) }
        if ($PlainBytes) { [Array]::Clear($PlainBytes, 0, $PlainBytes.Length) }
        if ($Entropy) { [Array]::Clear($Entropy, 0, $Entropy.Length) }
        Remove-Variable Payload -ErrorAction SilentlyContinue
    }
}

function Get-LConnectCredentialStatus {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][string]$Root
    )

    $Path = Get-LConnectCredentialPath -Root $Root
    $Exists = Test-Path -LiteralPath $Path -PathType Leaf

    $Status = [ordered]@{
        credential_file = $Path
        exists = $Exists
        format = $null
        version = $null
        provider = $null
        scope = $null
        created_at = $null
        updated_at = $null
        decrypt_pass = $false
        runtime_api_key_configured = $false
        organization_id_configured = $false
        acl_hardened = $false
        error_code = $null
    }

    if (-not $Exists) {
        $Status.error_code = 'CREDENTIAL_NOT_CONFIGURED'
        return [pscustomobject]$Status
    }

    $Status.acl_hardened = Test-LConnectCredentialAcl -Path $Path

    try {
        $Stored = Read-LConnectStoredCredential -Root $Root
        $Status.format = $Stored.Format
        $Status.version = $Stored.Version
        $Status.provider = $Stored.Provider
        $Status.scope = $Stored.Scope
        $Status.created_at = $Stored.CreatedAt
        $Status.updated_at = $Stored.UpdatedAt
        $Status.decrypt_pass = $true
        $Status.runtime_api_key_configured = -not [string]::IsNullOrWhiteSpace($Stored.RuntimeApiKey)
        $Status.organization_id_configured = -not [string]::IsNullOrWhiteSpace($Stored.OrganizationId)
    }
    catch {
        $Message = $_.Exception.Message
        if ($Message -match '^([A-Z_]+):') {
            $Status.error_code = $Matches[1]
        }
        else {
            $Status.error_code = 'CREDENTIAL_READ_FAILED'
        }
    }
    finally {
        Remove-Variable Stored -ErrorAction SilentlyContinue
    }

    return [pscustomobject]$Status
}

function Remove-LConnectStoredCredential {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][string]$Root
    )

    $Path = Get-LConnectCredentialPath -Root $Root
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        Remove-Item -LiteralPath $Path -Force
        return [pscustomobject]@{ removed = $true; path = $Path }
    }

    return [pscustomobject]@{ removed = $false; path = $Path }
}

function Resolve-LConnectCredential {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][string]$Root,
        [string]$ApiKey,
        [string]$OrganizationId,
        [switch]$NonInteractive,
        [switch]$NoCredentialSave
    )

    $ApiSource = $null
    $OrgSource = $null

    if (-not [string]::IsNullOrWhiteSpace($ApiKey)) {
        $ApiSource = 'parameter'
    }
    elseif (-not [string]::IsNullOrWhiteSpace($env:CONTROL_PLANE_API_KEY)) {
        $ApiKey = [string]$env:CONTROL_PLANE_API_KEY
        $ApiSource = 'environment'
    }

    if (-not [string]::IsNullOrWhiteSpace($OrganizationId)) {
        $OrgSource = 'parameter'
    }
    elseif (-not [string]::IsNullOrWhiteSpace($env:CONTROL_PLANE_ORGANIZATION_ID)) {
        $OrganizationId = [string]$env:CONTROL_PLANE_ORGANIZATION_ID
        $OrgSource = 'environment'
    }

    $StoredStatus = Get-LConnectCredentialStatus -Root $Root
    if (([string]::IsNullOrWhiteSpace($ApiKey) -or [string]::IsNullOrWhiteSpace($OrganizationId)) -and $StoredStatus.exists) {
        if (-not $StoredStatus.decrypt_pass) {
            if ($NonInteractive) {
                throw "$($StoredStatus.error_code): Stored credential cannot be used non-interactively. Run Setup-LConnectCredential.cmd."
            }
            Write-Warning "Stored encrypted credential could not be decrypted ($($StoredStatus.error_code)). You can enter replacement values now."
        }
        else {
            $Stored = Read-LConnectStoredCredential -Root $Root
            if ([string]::IsNullOrWhiteSpace($ApiKey)) {
                $ApiKey = $Stored.RuntimeApiKey
                $ApiSource = 'stored-dpapi'
            }
            if ([string]::IsNullOrWhiteSpace($OrganizationId)) {
                $OrganizationId = $Stored.OrganizationId
                $OrgSource = 'stored-dpapi'
            }
            Remove-Variable Stored -ErrorAction SilentlyContinue
        }
    }

    $Prompted = $false

    if ([string]::IsNullOrWhiteSpace($ApiKey)) {
        if ($NonInteractive) {
            throw 'CREDENTIAL_NOT_CONFIGURED: Runtime API key is unavailable. Run Setup-LConnectCredential.cmd first.'
        }

        $Secure = Read-Host 'OpenAI Runtime API key (input is hidden)' -AsSecureString
        $Bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
        try {
            $ApiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Bstr)
        }
        finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Bstr)
        }
        $ApiSource = 'interactive'
        $Prompted = $true
    }

    if ([string]::IsNullOrWhiteSpace($OrganizationId)) {
        if ($NonInteractive) {
            throw 'CREDENTIAL_NOT_CONFIGURED: Organization ID is unavailable. Run Setup-LConnectCredential.cmd first.'
        }

        $OrganizationId = Read-Host 'OpenAI Organization ID (org_... or org-...)'
        $OrgSource = 'interactive'
        $Prompted = $true
    }

    if ([string]::IsNullOrWhiteSpace($ApiKey) -or [string]::IsNullOrWhiteSpace($OrganizationId)) {
        throw 'CREDENTIAL_NOT_CONFIGURED: Required credential values are incomplete.'
    }

    $Saved = $false
    if ($Prompted -and -not $NoCredentialSave) {
        $Answer = Read-Host 'Save these values encrypted in local-secrets\credentials.json.enc for automatic restart? [Y/n]'
        if ([string]::IsNullOrWhiteSpace($Answer) -or $Answer -match '^(?i)y(es)?$') {
            Write-LConnectStoredCredential -Root $Root -RuntimeApiKey $ApiKey -OrganizationId $OrganizationId | Out-Null
            $Saved = $true
        }
    }

    return [pscustomobject]@{
        RuntimeApiKey = $ApiKey
        OrganizationId = $OrganizationId
        ApiKeySource = $ApiSource
        OrganizationIdSource = $OrgSource
        StoredDuringResolution = $Saved
    }
}