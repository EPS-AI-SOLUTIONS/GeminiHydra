<#
.SYNOPSIS
    Backup script for GeminiHydra.
    Excludes heavy folders like node_modules and .git to keep backups light.
#>

$SourceDir = $PSScriptRoot
$BackupDir = "$PSScriptRoot\Backups"
$DateStr = Get-Date -Format "yyyy-MM-dd_HH-mm"
$ArchiveName = "$BackupDir\GeminiHydra_Backup_$DateStr.zip"

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

Write-Host "Starting Backup of GeminiHydra..." -ForegroundColor Cyan

# Define exclusion list for Compress-Archive (it's tricky, so we filter first)
$Exclude = @("node_modules", ".git", "dist", "Backups", "tmp", "cache")

$FilesToZip = Get-ChildItem -Path $SourceDir -Recurse | Where-Object {
    $path = $_.FullName
    $shouldExclude = $false
    foreach ($ex in $Exclude) {
        if ($path -like "*\$ex\*") {
            $shouldExclude = $true
            break
        }
    }
    -not $shouldExclude
}

# Compress-Archive has limits on file count/size, using .NET class is safer for complex trees,
# but for simplicity in "Medium" tier, we try standard cmdlet or fallback.
# Actually, standard Compress-Archive is slow and buggy for deep trees (node_modules).
# Since we excluded node_modules, it should be fine.

Write-Host "Compressing files (skipping node_modules, .git)..." -ForegroundColor Yellow

try {
    # Using a temporary list file approach or direct piping might fail with path length.
    # We will zip key folders individually to be safe.
    
    $KeyFolders = @("AgentSwarm.psm1", "gemini.ps1", "GeminiExtras.psm1", "GeminiGUI\src", "GeminiGUI\src-tauri", "data", ".gemini", "grimoires")
    $FullPaths = $KeyFolders | ForEach-Object { Join-Path $SourceDir $_ } | Where-Object { Test-Path $_ }
    
    Compress-Archive -Path $FullPaths -DestinationPath $ArchiveName -CompressionLevel Optimal -Force
    
    Write-Host "Backup Success: $ArchiveName" -ForegroundColor Green
} catch {
    Write-Error "Backup Failed: $_"
}
