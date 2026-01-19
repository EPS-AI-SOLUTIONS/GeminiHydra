# ==========================================
# HYDRA REPAIR & RECOVERY TOOL
# ==========================================

# Set encoding to UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Clear-Host
Write-Host "🔧 HYDRA SYSTEM REPAIR" -ForegroundColor Cyan
Write-Host "======================" -ForegroundColor DarkGray

$BackupDir = Join-Path $PSScriptRoot "backups"

# Check if backup directory exists
if (-not (Test-Path $BackupDir)) {
    Write-Host "❌ No 'backups' directory found." -ForegroundColor Red
    Write-Host "   Run 'node scripts/backup.ps1' to create one."
    exit
}

# Get ZIP files sorted by date (newest first)
$Backups = Get-ChildItem -Path $BackupDir -Filter "*.zip" | Sort-Object LastWriteTime -Descending

if ($Backups.Count -eq 0) {
    Write-Host "⚠️  No backup files (*.zip) found in $BackupDir" -ForegroundColor Yellow
    exit
}

# Display Menu
Write-Host "`nAvailable Restoration Points:" -ForegroundColor Green
$Index = 1
foreach ($File in $Backups) {
    $Size = "{0:N2} MB" -f ($File.Length / 1MB)
    $Date = $File.LastWriteTime.ToString("yyyy-MM-dd HH:mm")
    Write-Host " [$Index] $($File.Name)" -NoNewline -ForegroundColor White
    Write-Host " ($Date | $Size)" -ForegroundColor DarkGray
    $Index++
}
Write-Host " [0] Cancel (Exit)" -ForegroundColor Gray

# User Selection
Write-Host ""
$Selection = Read-Host "Select backup to restore [0-$($Backups.Count)]"

# Handle Exit
if (-not $Selection -or $Selection -eq '0') {
    Write-Host "Cancelled."
    exit
}

# Validate and Execute
try {
    $Idx = [int]$Selection - 1
    if ($Idx -ge 0 -and $Idx -lt $Backups.Count) {
        $TargetFile = $Backups[$Idx]
        
        Write-Host "`n⚠️  WARNING: This will overwrite current data in .hydra-data and .serena" -ForegroundColor Red
        $Confirm = Read-Host "Type 'YES' to confirm restoration"
        
        if ($Confirm -eq 'YES') {
            Write-Host "`n♻️  Restoring from: $($TargetFile.Name)..." -ForegroundColor Cyan
            
            # Stop processes that might lock files (optional, best effort)
            Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like "*Hydra*" } | Stop-Process -Force -ErrorAction SilentlyContinue

            # Extract
            Expand-Archive -Path $TargetFile.FullName -DestinationPath $PSScriptRoot -Force
            
            Write-Host "✅ System restored successfully." -ForegroundColor Green
        } else {
            Write-Host "Restoration aborted." -ForegroundColor Yellow
        }
    } else {
        Write-Host "❌ Invalid selection." -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
}

Write-Host "`nPress any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
