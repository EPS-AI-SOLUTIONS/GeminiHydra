$SourceDir = Join-Path $PSScriptRoot "..\.hydra-data"
$MemoryDir = Join-Path $PSScriptRoot "..\.serena"
$BackupDir = Join-Path $PSScriptRoot "..\backups"

if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir | Out-Null }

$Timestamp = (Get-Date).ToString("yyyyMMdd-HHmm")
$ZipFile = Join-Path $BackupDir "hydra_backup_$Timestamp.zip"

Write-Host "Backing up data..."

$FilesToZip = @()
if (Test-Path $SourceDir) { $FilesToZip += $SourceDir }
if (Test-Path $MemoryDir) { $FilesToZip += $MemoryDir }

if ($FilesToZip.Count -gt 0) {
    Compress-Archive -Path $FilesToZip -DestinationPath $ZipFile -Force
    Write-Host "Success: $ZipFile"
}
