<#
.SYNOPSIS
Creates a scoped PostgreSQL and report-data backup for the Compose deployment.
#>
[CmdletBinding()]
param(
    [string]$ComposeFile,
    [string]$OutputDirectory,
    [ValidatePattern("^[a-z0-9][a-z0-9_-]*$")]
    [string]$ProjectName = "aisec",
    [switch]$ValidateOnly
)

$ErrorActionPreference = "Stop"
if (-not $ComposeFile) {
    $ComposeFile = Join-Path $PSScriptRoot "compose.yaml"
}
if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path (
        Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
    ) "ai-security-backups"
}

function Test-IsWithinPath {
    param([string]$Candidate, [string]$Parent)

    $separator = [IO.Path]::DirectorySeparatorChar
    $parentPrefix = $Parent.TrimEnd("\", "/") + $separator
    return $Candidate.Equals($Parent, [StringComparison]::OrdinalIgnoreCase) -or
        $Candidate.StartsWith($parentPrefix, [StringComparison]::OrdinalIgnoreCase)
}

function Resolve-SafeExternalDirectory {
    param([string]$PathValue)

    $resolved = [IO.Path]::GetFullPath($PathValue)
    $repoRoot = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
    $volumeRoot = [IO.Path]::GetPathRoot($resolved)
    if ($resolved.Equals($volumeRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Backup output cannot be a filesystem root: $resolved"
    }
    if (Test-IsWithinPath -Candidate $resolved -Parent $repoRoot) {
        throw "Backup output must be outside the repository: $repoRoot"
    }
    return $resolved
}

function Invoke-Docker {
    param([string[]]$Arguments)

    $output = & docker @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "docker command failed: docker $($Arguments -join ' ')"
    }
    return $output
}

function Get-ServiceContainer {
    param([string[]]$ComposeArguments, [string]$Service)

    $container = (
        Invoke-Docker -Arguments ($ComposeArguments + @("ps", "-q", $Service)) |
            Select-Object -First 1
    )
    if (-not $container) {
        throw "Compose service is unavailable: $Service"
    }
    $container = $container.Trim()
    $running = (
        Invoke-Docker -Arguments @("inspect", "--format", "{{.State.Running}}", $container) |
            Select-Object -First 1
    )
    if ($running -ne "true") {
        throw "Compose service is not running: $Service"
    }
    return $container
}

$composePath = (Resolve-Path -LiteralPath $ComposeFile).Path
$outputRoot = Resolve-SafeExternalDirectory -PathValue $OutputDirectory
if ($ValidateOnly) {
    Write-Output "Backup validation OK: $outputRoot"
    exit 0
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "docker is required"
}

$composeArguments = @("compose", "-f", $composePath, "-p", $ProjectName)
$postgresContainer = Get-ServiceContainer -ComposeArguments $composeArguments -Service "postgres"
$apiContainer = Get-ServiceContainer -ComposeArguments $composeArguments -Service "api"
$timestamp = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ")
$backupDirectory = Join-Path $outputRoot $timestamp
$reportsDirectory = Join-Path $backupDirectory "reports"
$databaseFile = Join-Path $backupDirectory "database.dump"
$containerDump = "/tmp/aisec-backup-$timestamp.dump"

if (Test-Path -LiteralPath $backupDirectory) {
    throw "Refusing to overwrite an existing backup: $backupDirectory"
}
New-Item -ItemType Directory -Path $reportsDirectory -Force | Out-Null
$migrationHead = (
    Invoke-Docker -Arguments (
        $composeArguments + @(
            "exec", "-T", "postgres", "psql",
            "--username", "aisec", "--dbname", "aisec",
            "--tuples-only", "--no-align",
            "--command", "SELECT version_num FROM alembic_version ORDER BY version_num"
        )
    )
) -join "`n"
$apiStopped = $false
try {
    Invoke-Docker -Arguments (
        $composeArguments + @("stop", "--timeout", "30", "api")
    ) | Out-Null
    $apiStopped = $true
    try {
        Invoke-Docker -Arguments (
            $composeArguments + @(
                "exec", "-T", "postgres", "pg_dump",
                "--username", "aisec", "--dbname", "aisec",
                "--format=custom", "--file=$containerDump"
            )
        ) | Out-Null
        Invoke-Docker -Arguments @(
            "cp", "${postgresContainer}:${containerDump}", $databaseFile
        ) | Out-Null
    }
    finally {
        Invoke-Docker -Arguments (
            $composeArguments + @(
                "exec", "-T", "postgres", "rm", "-f", "--", $containerDump
            )
        ) | Out-Null
    }

    Invoke-Docker -Arguments @(
        "cp", "${apiContainer}:/app/data/reports/.", $reportsDirectory
    ) | Out-Null

    $manifest = [ordered]@{
        created_at_utc = $timestamp
        compose_project = $ProjectName
        migration_head = $migrationHead.Trim()
        database_file = "database.dump"
        reports_directory = "reports"
    }
    $manifest | ConvertTo-Json | Set-Content -LiteralPath (
        Join-Path $backupDirectory "manifest.json"
    ) -Encoding UTF8
}
finally {
    if ($apiStopped) {
        Invoke-Docker -Arguments (
            $composeArguments + @("start", "api")
        ) | Out-Null
    }
}

Write-Output "Backup completed: $backupDirectory"
