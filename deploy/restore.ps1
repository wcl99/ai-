<#
.SYNOPSIS
Restores one validated backup into the existing Compose deployment.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$BackupDirectory,
    [string]$ComposeFile,
    [ValidatePattern("^[a-z0-9][a-z0-9_-]*$")]
    [string]$ProjectName = "aisec",
    [string]$RestoreImage,
    [switch]$ConfirmRestore,
    [switch]$ValidateOnly
)

$ErrorActionPreference = "Stop"
if (-not $ComposeFile) {
    $ComposeFile = Join-Path $PSScriptRoot "compose.yaml"
}

function Test-IsWithinPath {
    param([string]$Candidate, [string]$Parent)

    $separator = [IO.Path]::DirectorySeparatorChar
    $parentPrefix = $Parent.TrimEnd("\", "/") + $separator
    return $Candidate.Equals($Parent, [StringComparison]::OrdinalIgnoreCase) -or
        $Candidate.StartsWith($parentPrefix, [StringComparison]::OrdinalIgnoreCase)
}

function Resolve-SafeBackupDirectory {
    param([string]$PathValue)

    $resolved = (Resolve-Path -LiteralPath $PathValue).Path
    $repoRoot = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
    $volumeRoot = [IO.Path]::GetPathRoot($resolved)
    if ($resolved.Equals($volumeRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Backup directory cannot be a filesystem root: $resolved"
    }
    if (Test-IsWithinPath -Candidate $resolved -Parent $repoRoot) {
        throw "Backup directory must be outside the repository: $repoRoot"
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

function Get-AlembicRevision {
    param([string]$Text)

    $match = [regex]::Match($Text, "(?m)^\s*([0-9A-Za-z_]+)")
    if (-not $match.Success) {
        throw "Unable to read an Alembic revision"
    }
    return $match.Groups[1].Value
}

$composePath = (Resolve-Path -LiteralPath $ComposeFile).Path
$backupPath = Resolve-SafeBackupDirectory -PathValue $BackupDirectory
$manifestPath = Join-Path $backupPath "manifest.json"
$databasePath = Join-Path $backupPath "database.dump"
$reportsPath = Join-Path $backupPath "reports"
foreach ($requiredPath in @($manifestPath, $databasePath, $reportsPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Backup is incomplete; missing: $requiredPath"
    }
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.database_file -ne "database.dump" -or
    $manifest.reports_directory -ne "reports") {
    throw "Backup manifest contains unexpected paths"
}
if ($manifest.compose_project -ne $ProjectName) {
    throw "Backup belongs to Compose project '$($manifest.compose_project)', not '$ProjectName'"
}
if ($ValidateOnly) {
    Write-Output "Restore validation OK: $backupPath"
    exit 0
}
if (-not $ConfirmRestore) {
    throw "Restore is destructive; pass -ConfirmRestore to continue"
}
if ([string]::IsNullOrWhiteSpace($RestoreImage)) {
    throw "RestoreImage is required and must identify the backup-compatible API image"
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "docker is required"
}

$env:API_IMAGE = $RestoreImage
$composeArguments = @("compose", "-f", $composePath, "-p", $ProjectName)
if ($RestoreImage -match "@sha256:[0-9a-fA-F]{64}$") {
    Invoke-Docker -Arguments @("pull", $RestoreImage) | Out-Null
}
else {
    Invoke-Docker -Arguments @("image", "inspect", $RestoreImage) | Out-Null
}
$imageMigrationHead = (
    Invoke-Docker -Arguments (
        $composeArguments + @("run", "--rm", "--no-deps", "api", "alembic", "heads")
    )
) -join "`n"
$backupRevision = Get-AlembicRevision -Text ([string]$manifest.migration_head)
$imageRevision = Get-AlembicRevision -Text $imageMigrationHead
if ($backupRevision -ne $imageRevision) {
    throw "Restore image migration '$imageRevision' does not match backup '$backupRevision'"
}
$postgresContainer = Get-ServiceContainer -ComposeArguments $composeArguments -Service "postgres"
$apiContainer = Get-ServiceContainer -ComposeArguments $composeArguments -Service "api"
$timestamp = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ")
$containerDump = "/tmp/aisec-restore-$timestamp.dump"
$reportStage = "/app/data/reports/.restore-$timestamp"

Invoke-Docker -Arguments (
    $composeArguments + @("stop", "--timeout", "30", "api")
) | Out-Null

$createReportStage = @"
from pathlib import Path
root = Path("/app/data/reports").resolve()
stage = Path("$reportStage")
if str(root) != "/app/data/reports" or stage.parent.resolve() != root or stage.exists():
    raise SystemExit("unsafe report staging path")
stage.mkdir()
"@
Invoke-Docker -Arguments (
    $composeArguments + @(
        "run", "--rm", "--no-deps", "api", "python", "-c", $createReportStage
    )
) | Out-Null
Invoke-Docker -Arguments @(
    "cp", (Join-Path $reportsPath "."), "${apiContainer}:${reportStage}"
) | Out-Null

try {
    Invoke-Docker -Arguments @(
        "cp", $databasePath, "${postgresContainer}:${containerDump}"
    ) | Out-Null
    Invoke-Docker -Arguments (
        $composeArguments + @(
            "exec", "-T", "postgres", "pg_restore",
            "--clean", "--if-exists", "--no-owner", "--single-transaction",
            "--exit-on-error",
            "--username", "aisec", "--dbname", "aisec", $containerDump
        )
    ) | Out-Null
}
finally {
    Invoke-Docker -Arguments (
        $composeArguments + @("exec", "-T", "postgres", "rm", "-f", "--", $containerDump)
    ) | Out-Null
}

$replaceReports = @"
from pathlib import Path
import shutil
root = Path("/app/data/reports").resolve()
stage = Path("$reportStage").resolve()
if str(root) != "/app/data/reports" or stage.parent != root or not stage.is_dir():
    raise SystemExit("unsafe report replacement path")
for child in root.iterdir():
    if child == stage:
        continue
    shutil.rmtree(child) if child.is_dir() and not child.is_symlink() else child.unlink()
for child in stage.iterdir():
    shutil.move(str(child), root / child.name)
stage.rmdir()
"@
Invoke-Docker -Arguments (
    $composeArguments + @(
        "run", "--rm", "--no-deps", "api", "python", "-c", $replaceReports
    )
) | Out-Null
Invoke-Docker -Arguments (
    $composeArguments + @("up", "-d", "--no-deps", "--force-recreate", "api")
) | Out-Null

Write-Output "Restore completed from: $backupPath"
