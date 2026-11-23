#requires -Version 5.1
<#
.SYNOPSIS
  HTTP-level PostgREST tests for the canonical profiles role guard.

.DESCRIPTION
  Run only against a local Supabase stack or a dedicated staging project. This
  script writes only disposable test users and their profiles. It never writes
  an existing user's profile.

  The script creates auth users through the Supabase Admin API, signs them in,
  runs the HTTP checks, and deletes them in a finally block. Cleanup verifies
  that the auth user is gone and that the FK cascade removed each disposable
  profile. If cleanup or restoration fails, the script exits non-zero and
  prints the IDs it could not remove.

  These tests are the only proof of real PostgREST behavior. The SQL scratch
  test in this directory proves database behavior, not HTTP status mapping,
  JWT handling, or the SQL that PostgREST generates for upsert.

  TARGET APPROVAL:
    The REST endpoint must resolve to the exact project reference supplied in
    STAGING_PROJECT_REF, and CONFIRM_STAGING_PROJECT_REF must repeat that exact
    value. A remote endpoint is rejected unless ALLOW_REMOTE_STAGING=yes. The
    project reference is derived from the POSTGREST_URL host: <ref>.supabase.co
    becomes <ref>; localhost/127.0.0.1/::1 become "local"; any other host must
    match the exact host string supplied as STAGING_PROJECT_REF. The value
    "local" is reserved for loopback targets and is rejected on a remote host
    or a hosted Supabase project ref. This is an explicit allowlist, not a
    generic remote-staging bypass.

  DISPOSABLE USERS AND THE SERVICE KEY:
    SUPABASE_SERVICE_ROLE_KEY is mandatory even when SKIP_SERVICE_ROLE_TESTS=1.
    The key is used for the Admin API lifecycle of the disposable users, not
    only for the service-role assertions. There is no existing-user mode, so a
    missing key is a hard failure before any test user is created.

  Required environment variables:
    POSTGREST_URL              e.g. http://127.0.0.1:54321/rest/v1
    SUPABASE_ANON_KEY          publishable/anon key
    SUPABASE_SERVICE_ROLE_KEY  service-role key (server-side only)
    CONFIRM_STAGING            must be exactly "yes"
    STAGING_PROJECT_REF        exact approved project ref, or "local" for a local stack
    CONFIRM_STAGING_PROJECT_REF must exactly repeat STAGING_PROJECT_REF

  Optional:
    ALLOW_REMOTE_STAGING       must be "yes" for any non-localhost POSTGREST_URL
                               or non-localhost STAGING_DB_URL
    SKIP_SERVICE_ROLE_TESTS    "1" to skip the service-role ACL block only

  UPDATE(id) necessity experiment (optional, staging only):
    RUN_UPDATE_ID_EXPERIMENT=yes
    ALLOW_DB_MUTATION=yes
    STAGING_DB_URL             psql connection string for the SAME approved
                               staging project as POSTGREST_URL
    psql                       must be on PATH

  The experiment revokes UPDATE (id) from authenticated, proves the upsert is
  denied with SQLSTATE 42501, then restores the grant and proves the upsert
  works again. Before any ACL mutation it derives the project reference from
  STAGING_DB_URL (db.<ref>.supabase.co, or an official *.pooler.supabase.com
  host with a postgres.<ref> user) and requires an exact match with the approved
  REST project. Custom DB hostnames are not accepted as proof of project
  identity, even if their username looks like postgres.<ref>. Multi-host,
  hostaddr, service-file, and URI host-query overrides are rejected because psql
  could connect somewhere other than the verified host. If the reference cannot
  be derived,
  the experiment refuses to run. The restore runs in a
  finally block. If the process is killed hard, run the emergency restore
  manually:
      grant update (id) on table public.profiles to authenticated;
      select has_column_privilege('authenticated','public.profiles','id','UPDATE');

  The experiment is never run by default. It must not be run against
  production. The normal harness still creates disposable users if the
  experiment is skipped.

  If the Admin API creates a user but the response does not contain a usable
  id, the email is reported and cleanup records a manual action. Locate that
  exact address in the staging project's Auth users, delete it, and verify that
  its profile row is gone. Never reuse a real user's email for this test.

  Example:
    $env:POSTGREST_URL = "http://127.0.0.1:54321/rest/v1"
    $env:STAGING_PROJECT_REF = "local"
    $env:CONFIRM_STAGING_PROJECT_REF = "local"
    $env:CONFIRM_STAGING = "yes"
    powershell -NoProfile -File supabase/tests/profiles_role_privilege.postgrest.ps1

.NOTES
  NOT RUN by the review that produced this file. No local or staging
  PostgREST environment was available, so every HTTP expectation below is
  unproven until this script is executed.

  No SQL, database ACL, or HTTP test in this file was executed by the review.
  Only the PowerShell parser and the repository's static migration verifier
  were run.
#>

$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  throw "FAIL: $Message"
}

function Require-Env([string]$Name) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    Fail "missing required environment variable $Name"
  }
  return $value
}

function Get-AuthBase([string]$Url) {
  $trimmed = $Url.TrimEnd("/")
  if ($trimmed -match "^(.*)/rest/v1$") {
    return "$($matches[1])/auth/v1"
  }
  return "$trimmed/auth/v1"
}

function Get-RestBase([string]$Url) {
  $trimmed = $Url.TrimEnd("/")
  if ($trimmed -match "/rest/v1$") {
    return $trimmed
  }
  return "$trimmed/rest/v1"
}

function Normalize-HostName([string]$HostName) {
  if ([string]::IsNullOrWhiteSpace($HostName)) {
    return ""
  }
  $value = $HostName.Trim().TrimEnd('.').ToLowerInvariant()
  if ($value.StartsWith("[") -and $value.EndsWith("]")) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  return $value
}

function Test-LocalHostName([string]$HostName) {
  $value = Normalize-HostName $HostName
  return ($value -eq "localhost" -or $value -eq "127.0.0.1" -or $value -eq "::1")
}

function Get-RestProjectId([string]$Url) {
  $uri = $null
  if (-not [uri]::TryCreate($Url, [System.UriKind]::Absolute, [ref]$uri)) {
    Fail "POSTGREST_URL is not an absolute URI: $Url"
  }
  $hostName = Normalize-HostName $uri.Host
  if (Test-LocalHostName $hostName) {
    return "local"
  }
  if ($hostName -eq "local") {
    # "local" is the sentinel for a loopback target. A DNS host literally named
    # "local" must not inherit that trust and skip the remote-staging guard.
    Fail "POSTGREST_URL host 'local' is reserved for loopback targets; use a fully qualified staging hostname"
  }
  if ($hostName -match '^([a-z0-9-]+)\.supabase\.co$') {
    if ($Matches[1] -ceq "local") {
      Fail "POSTGREST_URL uses the reserved local project reference on a hosted Supabase host"
    }
    return $Matches[1]
  }
  return $hostName
}

function Get-DsnKeywordValue([string]$Dsn, [string]$Key) {
  $pattern = "(?i)(?:^|[;\s])" + [regex]::Escape($Key) + "\s*=\s*('(?:[^']|'')*'|[^;\s]+)"
  if ($Dsn -match $pattern) {
    $value = $Matches[1]
    if ($value.Length -ge 2 -and $value.StartsWith("'") -and $value.EndsWith("'")) {
      $value = $value.Substring(1, $value.Length - 2).Replace("''", "'")
    }
    return $value
  }
  return $null
}

function Get-DbConnectionIdentity([string]$Dsn) {
  if ([string]::IsNullOrWhiteSpace($Dsn)) {
    return $null
  }

  # A hostaddr or service override can make psql connect somewhere other than
  # the host this script inspects. Refuse those forms rather than pretend the
  # project identity was verified.
  if ($Dsn -match '(?i)(?:^|[;\s&?])(?:hostaddr|service)\s*=') {
    return $null
  }

  $hostName = $null
  $userName = $null
  if ($Dsn -match '^(?i)(postgres|postgresql)://') {
    $uri = $null
    if (-not [uri]::TryCreate($Dsn, [System.UriKind]::Absolute, [ref]$uri)) {
      return $null
    }
    if ($uri.Query -match '(?i)(?:^|[?&;])(?:host|hostaddr|service)\s*=') {
      # URI query parameters can override the authority host in libpq.
      return $null
    }
    $hostName = $uri.Host
    if (-not [string]::IsNullOrWhiteSpace($uri.UserInfo)) {
      $userPart = ($uri.UserInfo -split ':', 2)[0]
      $userName = [uri]::UnescapeDataString($userPart)
    }
  } else {
    $hostName = Get-DsnKeywordValue $Dsn "host"
    $userName = Get-DsnKeywordValue $Dsn "user"
  }

  $hostName = Normalize-HostName $hostName
  if (-not [string]::IsNullOrWhiteSpace($hostName) -and $hostName.Contains(',')) {
    # Libpq would try multiple hosts, so the first entry does not prove the
    # project psql actually reaches.
    return $null
  }
  if (-not [string]::IsNullOrWhiteSpace($userName)) {
    $userName = $userName.Trim().ToLowerInvariant()
  }

  if ([string]::IsNullOrWhiteSpace($hostName)) {
    return $null
  }
  return [pscustomobject]@{
    Host = $hostName
    User = $userName
  }
}

function Test-LocalDbEndpoint([string]$Url) {
  $identity = Get-DbConnectionIdentity $Url
  return ($null -ne $identity -and (Test-LocalHostName $identity.Host))
}

function Get-DbProjectId([string]$Dsn) {
  $identity = Get-DbConnectionIdentity $Dsn
  if ($null -eq $identity) {
    return $null
  }

  $hostName = $identity.Host
  $userName = $identity.User
  if (Test-LocalHostName $hostName) {
    return "local"
  }

  $hostRef = $null
  $userRef = $null
  $isDirectSupabaseHost = $hostName -match '^db\.([a-z0-9-]+)\.supabase\.co$'
  if ($isDirectSupabaseHost) {
    $hostRef = $Matches[1]
  }
  if (-not [string]::IsNullOrWhiteSpace($userName) -and $userName -match '^postgres\.([a-z0-9-]+)$') {
    $userRef = $Matches[1]
  }
  $isSupabasePoolerHost = $hostName -match '(^|\.)pooler\.supabase\.com$'

  # "local" is a script sentinel, not a Supabase project reference. A remote
  # database must not be able to impersonate the local target by putting
  # "local" in its host or its pooler username.
  if ($hostRef -ceq "local" -or $userRef -ceq "local") {
    Fail "STAGING_DB_URL uses the reserved local project reference on a non-local host"
  }

  # A custom hostname carrying a postgres.<ref> username is not evidence of a
  # Supabase project. Only the direct db.<ref>.supabase.co form and the official
  # pooler host form can establish the project identity; everything else fails
  # closed in Assert-DbMatchesStaging.
  if (-not $isDirectSupabaseHost -and -not $isSupabasePoolerHost) {
    return $null
  }
  if ($isSupabasePoolerHost -and $null -eq $userRef) {
    return $null
  }

  if ($null -ne $hostRef -and $null -ne $userRef -and $hostRef -ne $userRef) {
    Fail "STAGING_DB_URL host and user disagree on the Supabase project reference ($hostRef vs $userRef)"
  }
  if ($null -ne $hostRef) {
    return $hostRef
  }
  if ($null -ne $userRef) {
    return $userRef
  }
  return $null
}

function Assert-ApprovedStagingTarget([string]$Url) {
  $observed = Get-RestProjectId $Url
  $expected = (Require-Env "STAGING_PROJECT_REF").Trim()
  $confirmation = (Require-Env "CONFIRM_STAGING_PROJECT_REF").Trim()

  if ($observed -ceq "local") {
    if ($expected -cne "local") {
      Fail "POSTGREST_URL is local but STAGING_PROJECT_REF is '$expected'; use lowercase 'local' for a local stack"
    }
  } elseif ($expected -ceq "local") {
    Fail "STAGING_PROJECT_REF is 'local' but POSTGREST_URL resolves to project '$observed'"
  } elseif ($expected -cne $observed) {
    Fail "POSTGREST_URL project '$observed' does not match STAGING_PROJECT_REF '$expected' exactly"
  }

  if ($confirmation -cne $observed) {
    Fail "CONFIRM_STAGING_PROJECT_REF must exactly match the approved target '$observed'"
  }

  if ($observed -ne "local" -and $env:ALLOW_REMOTE_STAGING -ne "yes") {
    Fail "non-localhost POSTGREST_URL requires ALLOW_REMOTE_STAGING=yes; confirm it is a dedicated staging project"
  }

  if ($observed -eq "steamkit.lol" -or $observed.EndsWith(".steamkit.lol")) {
    Fail "refusing to run against the production steamkit.lol domain"
  }

  Write-Host "Approved staging project: $observed"
  return $observed
}

function Assert-DbMatchesStaging([string]$Dsn, [string]$ApprovedProject) {
  if ([string]::IsNullOrWhiteSpace($Dsn)) {
    Fail "STAGING_DB_URL is empty"
  }
  if (-not (Test-LocalDbEndpoint $Dsn) -and $env:ALLOW_REMOTE_STAGING -ne "yes") {
    Fail "non-localhost STAGING_DB_URL requires ALLOW_REMOTE_STAGING=yes"
  }

  $dbProject = Get-DbProjectId $Dsn
  if ([string]::IsNullOrWhiteSpace($dbProject)) {
    Fail "cannot derive the Supabase project from STAGING_DB_URL; use db.<ref>.supabase.co, an official *.pooler.supabase.com host with a postgres.<ref> user, or localhost for a local stack"
  }
  if ($dbProject -cne $ApprovedProject) {
    Fail "STAGING_DB_URL project '$dbProject' does not match the approved HTTP target '$ApprovedProject'"
  }

  Write-Host "STAGING_DB_URL project confirmed: $dbProject"
  return $dbProject
}

function Get-ErrorResult($ErrorRecord) {
  $response = $ErrorRecord.Exception.Response
  if ($null -eq $response) {
    Fail "request failed without an HTTP response: $($ErrorRecord.Exception.Message)"
  }

  $status = [int]$response.StatusCode
  $body = ""
  if ($response.PSObject.Properties.Name -contains "Content") {
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  } elseif ($response.GetResponseStream) {
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    try {
      $body = $reader.ReadToEnd()
    } finally {
      $reader.Dispose()
    }
  }

  return [pscustomobject]@{ Status = $status; Body = $body }
}

function Invoke-Api {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$Bearer,
    [string]$ApiKey,
    $Body,
    [string]$Prefer
  )

  $headers = @{
    apikey = $ApiKey
    Authorization = "Bearer $Bearer"
  }
  if ($Prefer) {
    $headers["Prefer"] = $Prefer
  }

  $parameters = @{
    Method = $Method
    Uri = "$script:RestBase$Path"
    Headers = $headers
  }
  if ($PSVersionTable.PSVersion.Major -lt 6) {
    $parameters["UseBasicParsing"] = $true
  }
  if ($null -ne $Body) {
    $parameters["ContentType"] = "application/json"
    $parameters["Body"] = ($Body | ConvertTo-Json -Depth 10 -Compress)
  }

  try {
    $response = Invoke-WebRequest @parameters
    return [pscustomobject]@{
      Status = [int]$response.StatusCode
      Body = $response.Content
    }
  } catch {
    return Get-ErrorResult $_
  }
}

function Invoke-AuthAdmin {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    $Body
  )

  $headers = @{
    apikey = $script:ServiceKey
    Authorization = "Bearer $script:ServiceKey"
  }
  $parameters = @{
    Method = $Method
    Uri = "$script:AuthBase$Path"
    Headers = $headers
  }
  if ($PSVersionTable.PSVersion.Major -lt 6) {
    $parameters["UseBasicParsing"] = $true
  }
  if ($null -ne $Body) {
    $parameters["ContentType"] = "application/json"
    $parameters["Body"] = ($Body | ConvertTo-Json -Depth 10 -Compress)
  }

  try {
    $response = Invoke-WebRequest @parameters
    return [pscustomobject]@{
      Status = [int]$response.StatusCode
      Body = $response.Content
    }
  } catch {
    return Get-ErrorResult $_
  }
}

function Get-Token([string]$AuthBase, [string]$ApiKey, [string]$Email, [string]$Password) {
  $body = @{ email = $Email; password = $Password } | ConvertTo-Json -Compress
  $tokenParameters = @{
    Method = "Post"
    Uri = "$AuthBase/token?grant_type=password"
    Headers = @{ apikey = $ApiKey }
    ContentType = "application/json"
    Body = $body
  }
  if ($PSVersionTable.PSVersion.Major -lt 6) {
    $tokenParameters["UseBasicParsing"] = $true
  }
  $response = Invoke-RestMethod @tokenParameters
  if ([string]::IsNullOrWhiteSpace($response.access_token)) {
    Fail "password grant returned no access_token for $Email"
  }
  return [pscustomobject]@{
    Token = $response.access_token
    UserId = $response.user.id
  }
}

function Assert-Status($Result, [int[]]$Expected, [string]$Name) {
  if ($Expected -notcontains $Result.Status) {
    Fail "$Name returned HTTP $($Result.Status), expected $($Expected -join '/'). Body: $($Result.Body)"
  }
  Write-Host "PASS $Name (HTTP $($Result.Status))"
}

function Assert-JsonField($Result, [string]$Field, [string]$Expected, [string]$Name) {
  $parsed = @($Result.Body | ConvertFrom-Json)
  if ($parsed.Count -lt 1) {
    Fail "$Name returned an empty representation: $($Result.Body)"
  }
  $actual = $parsed[0].$Field
  if ($actual -ne $Expected) {
    Fail "$Name field $Field was '$actual', expected '$Expected'"
  }
  Write-Host "PASS $Name ($Field = $Expected)"
}

function Assert-BodyContains($Result, [string]$Needle, [string]$Name) {
  if ([string]::IsNullOrEmpty($Result.Body) -or $Result.Body -notlike "*$Needle*") {
    Fail "$Name body did not contain '$Needle': $($Result.Body)"
  }
  Write-Host "PASS $Name (body contains $Needle)"
}

function New-DisposableUser([string]$Label) {
  $suffix = [guid]::NewGuid().ToString("N").Substring(0, 12)
  $user = [pscustomobject]@{
    Id = $null
    Email = "http-$Label-$suffix@example.test"
    Password = "Tmp!$([guid]::NewGuid().ToString('N'))"
    Label = $Label
    Token = $null
    Removed = $false
  }

  $createUser = Invoke-AuthAdmin -Method Post -Path "/admin/users" -Body @{
    email = $user.Email
    password = $user.Password
    email_confirm = $true
  }
  Assert-Status $createUser @(200, 201) "admin create disposable auth user $Label"

  # Register before parsing the response. If the Admin API created the account
  # but returned an unusable body, cleanup must still surface the email and fail
  # closed instead of silently forgetting the account.
  $script:DisposableUsers += $user

  try {
    $createUserJson = $createUser.Body | ConvertFrom-Json
    $createdId = if ($createUserJson.user) {
      $createUserJson.user.id
    } else {
      $createUserJson.id
    }
    if ([string]::IsNullOrWhiteSpace($createdId)) {
      throw "response contained no user id"
    }

    $parsedId = [guid]::Empty
    if (-not [guid]::TryParse([string]$createdId, [ref]$parsedId)) {
      throw "response id was not a UUID: $createdId"
    }
    $user.Id = $parsedId.ToString()
  } catch {
    Fail "admin create user $Label succeeded but the response was unusable: $($_.Exception.Message). Email=$($user.Email). Locate that exact email in the staging Auth users list, delete it, and verify its profile row is gone. Response: $($createUser.Body)"
  }

  return $user
}

function Remove-DisposableUser($User) {
  if ($null -eq $User -or $User.Removed) {
    return
  }

  $label = if ([string]::IsNullOrWhiteSpace([string]$User.Label)) { "unknown" } else { [string]$User.Label }
  $email = if ([string]::IsNullOrWhiteSpace([string]$User.Email)) { "unknown" } else { [string]$User.Email }

  if ([string]::IsNullOrWhiteSpace([string]$User.Id)) {
    $message = "could not clean disposable auth user $label <$email>: creation succeeded but no user id was captured; locate that exact email in the staging Auth users list, delete it, and verify its profile row is gone"
    $script:CleanupFailures += $message
    Write-Warning $message
    return
  }

  try {
    $cleanup = Invoke-AuthAdmin -Method Delete -Path "/admin/users/$($User.Id)"
    if ($cleanup.Status -notin @(200, 204, 404)) {
      $message = "could not delete disposable auth user $label id=$($User.Id) email=$email (HTTP $($cleanup.Status)); remove it manually"
      $script:CleanupFailures += $message
      Write-Warning $message
      return
    }

    $verifyUser = Invoke-AuthAdmin -Method Get -Path "/admin/users/$($User.Id)"
    if ($verifyUser.Status -ne 404) {
      $message = "auth user $label id=$($User.Id) email=$email still exists after delete (HTTP $($verifyUser.Status)); remove it manually"
      $script:CleanupFailures += $message
      Write-Warning $message
      return
    }

    $verify = Invoke-Api -Method Get -Path "/profiles?id=eq.$($User.Id)&select=id" -Bearer $script:ServiceKey -ApiKey $script:ServiceKey
    if ($verify.Status -ne 200) {
      $message = "auth user $label id=$($User.Id) email=$email was deleted, but profile-cascade verification failed (HTTP $($verify.Status)); inspect the profile manually"
      $script:CleanupFailures += $message
      Write-Warning $message
      return
    }

    try {
      $rows = @($verify.Body | ConvertFrom-Json)
    } catch {
      $message = "auth user $label id=$($User.Id) email=$email was deleted, but the profile check returned unparseable JSON: $($verify.Body); inspect the profile manually"
      $script:CleanupFailures += $message
      Write-Warning $message
      return
    }

    if ($rows.Count -ne 0) {
      $message = "auth-user delete did not cascade to the profile for $label id=$($User.Id) email=$email; remaining profile id(s): $($rows | ForEach-Object { $_.id } | Out-String). Remove the profile manually"
      $script:CleanupFailures += $message
      Write-Warning $message
      return
    }

    # Only now is cleanup proven complete. A failed auth deletion or profile
    # cascade must leave Removed=false so a caller cannot mistake it for success.
    $User.Removed = $true
    Write-Host "PASS cleanup disposable auth user $label and profile"
  } catch {
    $message = "cleanup failed for disposable auth user $label id=$($User.Id) email=$email : $($_.Exception.Message); remove it manually"
    $script:CleanupFailures += $message
    Write-Warning $message
  }
}

function Invoke-PsqlScalar([string]$Sql) {
  if ([string]::IsNullOrWhiteSpace($script:StagingDbUrl)) {
    Fail "STAGING_DB_URL is required for the UPDATE(id) experiment"
  }
  if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    Fail "psql is required for the UPDATE(id) experiment but was not found on PATH"
  }

  $output = & psql $script:StagingDbUrl --no-psqlrc -w -q -v ON_ERROR_STOP=1 -t -A -c $Sql 2>&1
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    Fail "psql failed with exit code ${exitCode}: $($output | Out-String)"
  }
  return (($output | Out-String).Trim())
}

function Get-UpdateIdAcl {
  return (Invoke-PsqlScalar "select case when has_column_privilege('authenticated','public.profiles','id','UPDATE') then 't' else 'f' end;")
}

function Invoke-UpdateIdExperiment($UserA) {
  if ($env:RUN_UPDATE_ID_EXPERIMENT -ne "yes") {
    Write-Host ""
    Write-Host "MANUAL STAGING STEP NOT RUN: UPDATE(id) necessity experiment."
    Write-Host "  Set RUN_UPDATE_ID_EXPERIMENT=yes, ALLOW_DB_MUTATION=yes, and"
    Write-Host "  STAGING_DB_URL, then rerun on a dedicated staging database."
    Write-Host "  Emergency restore if an interrupted run leaves the grant revoked:"
    Write-Host "    grant update (id) on table public.profiles to authenticated;"
    return
  }

  if ($env:ALLOW_DB_MUTATION -ne "yes") {
    Fail "RUN_UPDATE_ID_EXPERIMENT=yes requires ALLOW_DB_MUTATION=yes"
  }
  if ([string]::IsNullOrWhiteSpace($env:STAGING_DB_URL)) {
    Fail "RUN_UPDATE_ID_EXPERIMENT=yes requires STAGING_DB_URL"
  }
  if ($env:STAGING_DB_URL -match "steamkit\.lol") {
    Fail "refusing to mutate ACLs on steamkit.lol"
  }

  # Verify the DB target and the HTTP target are the same approved staging
  # project before making any psql connection or ACL change.
  [void](Assert-DbMatchesStaging $env:STAGING_DB_URL $script:ApprovedProjectId)

  if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    Fail "psql is required for the UPDATE(id) experiment but was not found on PATH"
  }

  $script:StagingDbUrl = $env:STAGING_DB_URL
  $before = Get-UpdateIdAcl
  if ($before -ne "t") {
    Fail "UPDATE(id) is not granted before the experiment; apply the canonical migration first"
  }

  try {
    # Mark the grant as needing restoration before issuing the revoke. If the
    # connection drops after the statement commits but before psql exits, the
    # finally block still attempts the idempotent grant.
    $script:UpdateIdRevoked = $true
    Invoke-PsqlScalar "revoke update (id) on table public.profiles from authenticated;" | Out-Null

    $afterRevoke = Get-UpdateIdAcl
    if ($afterRevoke -ne "f") {
      Fail "UPDATE(id) revoke did not take effect (has_column_privilege returned $afterRevoke)"
    }

    $denied = Invoke-Api -Method Post -Path "/profiles?on_conflict=id" -Bearer $UserA.Token -ApiKey $script:AnonKey -Body @{
      id = $UserA.Id
      display_name = "HTTP Alice Update Id Experiment"
      username = "http-a-$($UserA.Id.Substring(0, 8))"
      avatar_url = $null
      banner_url = $null
    } -Prefer "resolution=merge-duplicates,return=representation"

    if ($denied.Status -ne 403) {
      Fail "UPDATE(id) experiment expected HTTP 403 after revoke, got $($denied.Status). If this is a successful upsert, the deployed PostgREST no longer needs UPDATE(id); restore first, then remove the grant in a reviewed follow-up. Body: $($denied.Body)"
    }
    Write-Host "PASS UPDATE(id) experiment: upsert denied with HTTP 403 after revoke"
    Assert-BodyContains $denied "42501" "UPDATE(id) experiment SQLSTATE"
  } finally {
    if ($script:UpdateIdRevoked) {
      try {
        Invoke-PsqlScalar "grant update (id) on table public.profiles to authenticated;" | Out-Null
        $restored = Get-UpdateIdAcl
        if ($restored -ne "t") {
          throw "has_column_privilege returned $restored after restore"
        }
        $script:UpdateIdRevoked = $false
        Write-Host "PASS UPDATE(id) grant restored and verified"
      } catch {
        $message = "CRITICAL: UPDATE(id) restoration failed: $($_.Exception.Message). Run now: grant update (id) on table public.profiles to authenticated; then verify has_column_privilege('authenticated','public.profiles','id','UPDATE')."
        $script:CleanupFailures += $message
        Write-Warning $message
      }
    }
  }

  if ($script:UpdateIdRevoked) {
    Fail "UPDATE(id) is still revoked; run the emergency restore before leaving staging"
  }

  $restoredUpsert = Invoke-Api -Method Post -Path "/profiles?on_conflict=id" -Bearer $UserA.Token -ApiKey $script:AnonKey -Body @{
    id = $UserA.Id
    display_name = "HTTP Alice After Update Id Experiment"
    username = "http-a-$($UserA.Id.Substring(0, 8))"
    avatar_url = $null
    banner_url = $null
  } -Prefer "resolution=merge-duplicates,return=representation"
  Assert-Status $restoredUpsert @(200, 201) "UPDATE(id) experiment: upsert works after restore"
}

# ---------------------------------------------------------------------------
# Guardrails
# ---------------------------------------------------------------------------

$restUrl = Require-Env "POSTGREST_URL"
$anonKey = Require-Env "SUPABASE_ANON_KEY"
$serviceKey = Require-Env "SUPABASE_SERVICE_ROLE_KEY"
$confirm = Require-Env "CONFIRM_STAGING"

if ($confirm -ne "yes") {
  Fail "CONFIRM_STAGING must be exactly 'yes'"
}

# The target is an explicit allowlist: the REST host must resolve to the exact
# project reference supplied independently, and the confirmation must repeat it.
$script:ApprovedProjectId = Assert-ApprovedStagingTarget $restUrl

$script:RestBase = Get-RestBase $restUrl
$script:AuthBase = Get-AuthBase $restUrl
$script:ServiceKey = $serviceKey
$script:AnonKey = $anonKey
$script:DisposableUsers = @()
$script:CleanupFailures = @()
$script:UpdateIdRevoked = $false
$script:StagingDbUrl = $null
$authBase = $script:AuthBase

Write-Host "Target: $script:RestBase (project $script:ApprovedProjectId)"
Write-Host "This script creates and deletes disposable auth users. It never writes an existing profile."

# Random, non-existent id for denied anon writes. It is never an existing
# profile, so a failed expectation cannot damage a real row.
$targetId = [guid]::NewGuid().ToString()

$testFailure = $null

try {
  # A and B are disposable. A gets a profile during the upsert tests; B is used
  # for denied own-row column writes and cross-user attempts. C is an auth user
  # with no profile and is the FK-valid target for the denied cross-user INSERT.
  # None of them is an existing user row.
  $userA = New-DisposableUser "a"
  $tokenA = Get-Token $authBase $anonKey $userA.Email $userA.Password
  if ($tokenA.UserId -ne $userA.Id) {
    Fail "password grant for disposable user A returned sub $($tokenA.UserId), expected $($userA.Id)"
  }
  $userA.Token = $tokenA.Token

  $userB = New-DisposableUser "b"
  $tokenB = Get-Token $authBase $anonKey $userB.Email $userB.Password
  if ($tokenB.UserId -ne $userB.Id) {
    Fail "password grant for disposable user B returned sub $($tokenB.UserId), expected $($userB.Id)"
  }
  $userB.Token = $tokenB.Token

  # C exists only as an auth user with no profile. It gives the cross-user
  # INSERT a real FK target, so a missing RLS policy would produce a successful
  # insert rather than a foreign-key error.
  $userC = New-DisposableUser "c"

  # -------------------------------------------------------------------------
  # Anon and public read behavior
  # -------------------------------------------------------------------------

  $anonRead = Invoke-Api -Method Get -Path "/profiles?select=id,username,display_name&limit=1" -Bearer $anonKey -ApiKey $anonKey
  Assert-Status $anonRead @(200) "anon SELECT profiles"

  $anonInsert = Invoke-Api -Method Post -Path "/profiles" -Bearer $anonKey -ApiKey $anonKey -Body @{
    id = $targetId
    display_name = "Anon Insert"
  } -Prefer "return=representation"
  Assert-Status $anonInsert @(401, 403) "anon INSERT profiles"

  $anonUpdate = Invoke-Api -Method Patch -Path "/profiles?id=eq.$targetId" -Bearer $anonKey -ApiKey $anonKey -Body @{
    display_name = "Anon Update"
  }
  Assert-Status $anonUpdate @(401, 403) "anon UPDATE profiles"

  $anonDelete = Invoke-Api -Method Delete -Path "/profiles?id=eq.$targetId" -Bearer $anonKey -ApiKey $anonKey
  Assert-Status $anonDelete @(401, 403) "anon DELETE profiles"

  # -------------------------------------------------------------------------
  # Authenticated upsert and role writes
  # -------------------------------------------------------------------------

  $usernameA = "http-a-$($userA.Id.Substring(0, 8))"
  $upsertA1 = Invoke-Api -Method Post -Path "/profiles?on_conflict=id" -Bearer $userA.Token -ApiKey $anonKey -Body @{
    id = $userA.Id
    display_name = "HTTP Alice One"
    username = $usernameA
    avatar_url = $null
    banner_url = $null
  } -Prefer "resolution=merge-duplicates,return=representation"
  Assert-Status $upsertA1 @(200, 201) "authenticated INSERT own profile (id = excluded.id)"

  $upsertA2 = Invoke-Api -Method Post -Path "/profiles?on_conflict=id" -Bearer $userA.Token -ApiKey $anonKey -Body @{
    id = $userA.Id
    display_name = "HTTP Alice Two"
    username = $usernameA
    avatar_url = $null
    banner_url = $null
  } -Prefer "resolution=merge-duplicates,return=representation"
  Assert-Status $upsertA2 @(200, 201) "authenticated UPDATE own profile through merge-duplicates upsert"

  $roleRead = Invoke-Api -Method Get -Path "/profiles?id=eq.$($userA.Id)&select=id,display_name,role,created_at" -Bearer $userA.Token -ApiKey $anonKey
  Assert-Status $roleRead @(200) "authenticated read own profile after upserts"
  $roleReadJson = @($roleRead.Body | ConvertFrom-Json)
  if ($roleReadJson.Count -lt 1 -or $roleReadJson[0].role -ne "creator") {
    Fail "upsert changed role away from creator: $($roleRead.Body)"
  }
  if ($roleReadJson[0].display_name -ne "HTTP Alice Two") {
    Fail "second upsert did not update display_name: $($roleRead.Body)"
  }
  Write-Host "PASS upserts kept role = creator and updated display_name"

  # Positive public-read check. A status-only anon query could return 200 [] if
  # the public SELECT policy were missing, so assert that A's disposable row is
  # visible to anon.
  $anonReadA = Invoke-Api -Method Get -Path "/profiles?id=eq.$($userA.Id)&select=id,display_name" -Bearer $anonKey -ApiKey $anonKey
  Assert-Status $anonReadA @(200) "anon SELECT disposable A row"
  $anonReadAJson = @($anonReadA.Body | ConvertFrom-Json)
  if ($anonReadAJson.Count -ne 1 -or $anonReadAJson[0].id -ne $userA.Id) {
    Fail "anon did not see A's public profile: $($anonReadA.Body)"
  }
  Write-Host "PASS anon public SELECT returned A's row"

  $insertAdminNew = Invoke-Api -Method Post -Path "/profiles" -Bearer $userB.Token -ApiKey $anonKey -Body @{
    id = $userB.Id
    display_name = "HTTP Bob Admin"
    role = "admin"
  } -Prefer "return=representation"
  Assert-Status $insertAdminNew @(401, 403) "authenticated INSERT own role=admin"

  $insertAdmin = Invoke-Api -Method Post -Path "/profiles?on_conflict=id" -Bearer $userA.Token -ApiKey $anonKey -Body @{
    id = $userA.Id
    display_name = "HTTP Alice Admin"
    role = "admin"
  } -Prefer "resolution=merge-duplicates,return=representation"
  Assert-Status $insertAdmin @(401, 403) "authenticated upsert role=admin"

  $updateAdmin = Invoke-Api -Method Patch -Path "/profiles?id=eq.$($userA.Id)" -Bearer $userA.Token -ApiKey $anonKey -Body @{
    role = "admin"
  }
  Assert-Status $updateAdmin @(401, 403) "authenticated UPDATE role=admin"

  $createdAtInsertNew = Invoke-Api -Method Post -Path "/profiles" -Bearer $userB.Token -ApiKey $anonKey -Body @{
    id = $userB.Id
    display_name = "HTTP Bob Created At"
    created_at = "2000-01-01T00:00:00Z"
  } -Prefer "return=representation"
  Assert-Status $createdAtInsertNew @(401, 403) "authenticated INSERT own created_at"

  $createdAtInsert = Invoke-Api -Method Post -Path "/profiles?on_conflict=id" -Bearer $userA.Token -ApiKey $anonKey -Body @{
    id = $userA.Id
    display_name = "HTTP Alice Created At"
    created_at = "2000-01-01T00:00:00Z"
  } -Prefer "resolution=merge-duplicates,return=representation"
  Assert-Status $createdAtInsert @(401, 403) "authenticated upsert created_at"

  $createdAtUpdate = Invoke-Api -Method Patch -Path "/profiles?id=eq.$($userA.Id)" -Bearer $userA.Token -ApiKey $anonKey -Body @{
    created_at = "2000-01-01T00:00:00Z"
  }
  Assert-Status $createdAtUpdate @(401, 403) "authenticated UPDATE created_at"

  $verifyBEmpty = Invoke-Api -Method Get -Path "/profiles?id=eq.$($userB.Id)&select=id" -Bearer $userB.Token -ApiKey $anonKey
  Assert-Status $verifyBEmpty @(200) "authenticated read B after denied INSERTs"
  $verifyBJson = @($verifyBEmpty.Body | ConvertFrom-Json)
  if ($verifyBJson.Count -ne 0) {
    Fail "denied INSERTs created a B profile: $($verifyBEmpty.Body)"
  }
  Write-Host "PASS denied B INSERTs left no row"

  # -------------------------------------------------------------------------
  # Cross-user isolation
  # -------------------------------------------------------------------------

  $crossInsert = Invoke-Api -Method Post -Path "/profiles" -Bearer $userB.Token -ApiKey $anonKey -Body @{
    id = $userC.Id
    display_name = "Target by B"
  } -Prefer "return=representation"
  Assert-Status $crossInsert @(401, 403) "authenticated cross-user INSERT"

  $verifyCEmpty = Invoke-Api -Method Get -Path "/profiles?id=eq.$($userC.Id)&select=id" -Bearer $userB.Token -ApiKey $anonKey
  Assert-Status $verifyCEmpty @(200) "authenticated read C after denied cross-user INSERT"
  $verifyCJson = @($verifyCEmpty.Body | ConvertFrom-Json)
  if ($verifyCJson.Count -ne 0) {
    Fail "cross-user INSERT created a C profile: $($verifyCEmpty.Body)"
  }
  Write-Host "PASS denied cross-user INSERT left no row"

  $crossUpdate = Invoke-Api -Method Patch -Path "/profiles?id=eq.$($userA.Id)" -Bearer $userB.Token -ApiKey $anonKey -Body @{
    display_name = "Hacked by B"
  } -Prefer "return=representation"
  Assert-Status $crossUpdate @(200, 204) "authenticated cross-user UPDATE is filtered"

  $verifyA = Invoke-Api -Method Get -Path "/profiles?id=eq.$($userA.Id)&select=id,display_name,role" -Bearer $userA.Token -ApiKey $anonKey
  Assert-Status $verifyA @(200) "authenticated read own row after cross-user UPDATE"
  $verifyAJson = @($verifyA.Body | ConvertFrom-Json)
  if ($verifyAJson.Count -lt 1 -or $verifyAJson[0].display_name -ne "HTTP Alice Two") {
    Fail "cross-user UPDATE changed A: $($verifyA.Body)"
  }
  Write-Host "PASS cross-user UPDATE left A unchanged"

  $selfDelete = Invoke-Api -Method Delete -Path "/profiles?id=eq.$($userA.Id)" -Bearer $userA.Token -ApiKey $anonKey
  Assert-Status $selfDelete @(401, 403) "authenticated self DELETE"

  # -------------------------------------------------------------------------
  # Service-role provisioning
  # -------------------------------------------------------------------------

  if ($env:SKIP_SERVICE_ROLE_TESTS -ne "1") {
    $tempUser = New-DisposableUser "service"
    try {
      $serviceInsert = Invoke-Api -Method Post -Path "/profiles" -Bearer $serviceKey -ApiKey $serviceKey -Body @{
        id = $tempUser.Id
        display_name = "HTTP Temp"
        username = "http-temp-$($tempUser.Id.Substring(0, 8))"
        role = "admin"
      } -Prefer "return=representation"
      Assert-Status $serviceInsert @(200, 201) "service_role INSERT role=admin"
      Assert-JsonField $serviceInsert "role" "admin" "service_role INSERT role"

      $serviceUpdate = Invoke-Api -Method Patch -Path "/profiles?id=eq.$($tempUser.Id)" -Bearer $serviceKey -ApiKey $serviceKey -Body @{
        role = "creator"
        display_name = "HTTP Temp Updated"
      } -Prefer "return=representation"
      Assert-Status $serviceUpdate @(200) "service_role UPDATE role"
      Assert-JsonField $serviceUpdate "role" "creator" "service_role UPDATE role"

      $serviceDelete = Invoke-Api -Method Delete -Path "/profiles?id=eq.$($tempUser.Id)" -Bearer $serviceKey -ApiKey $serviceKey
      Assert-Status $serviceDelete @(401, 403) "service_role DELETE is denied"
    } finally {
      try {
        Remove-DisposableUser $tempUser
      } catch {
        $message = "cleanup threw for disposable service user id=$($tempUser.Id) email=$($tempUser.Email): $($_.Exception.Message); remove it manually"
        $script:CleanupFailures += $message
        Write-Warning $message
      }
    }
  } else {
    Write-Host "SKIP service-role HTTP tests (SKIP_SERVICE_ROLE_TESTS=1); disposable user lifecycle still uses the service key"
  }

  # -------------------------------------------------------------------------
  # Optional staging-only UPDATE(id) necessity experiment
  # -------------------------------------------------------------------------

  Invoke-UpdateIdExperiment $userA
} catch {
  $testFailure = $_
} finally {
  foreach ($disposable in @($script:DisposableUsers)) {
    try {
      Remove-DisposableUser $disposable
    } catch {
      $message = "cleanup threw for disposable user id=$($disposable.Id) email=$($disposable.Email): $($_.Exception.Message); remove it manually"
      $script:CleanupFailures += $message
      Write-Warning $message
    }
  }
}

if ($script:CleanupFailures.Count -gt 0) {
  $cleanupMessage = "cleanup or restoration failed: $($script:CleanupFailures -join ' | ')"
  if ($null -ne $testFailure) {
    $cleanupMessage += " Original test error: $($testFailure.Exception.Message)"
  }
  Fail $cleanupMessage
}

if ($null -ne $testFailure) {
  throw $testFailure
}

Write-Host ""
Write-Host "All executed PostgREST checks passed. Disposable auth users were deleted and their profiles were verified gone."
if ($env:RUN_UPDATE_ID_EXPERIMENT -ne "yes") {
  Write-Host "The UPDATE(id) necessity experiment was not run."
}
