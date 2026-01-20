# Claude Code GUI - Shortcut Creator
# Tworzy skrot na pulpicie do aplikacji GUI

$ErrorActionPreference = "Stop"

$scriptDir = "C:\Users\BIURODOM\Desktop\ClaudeCli"
$desktopPath = "C:\Users\BIURODOM\Desktop"

# Sciezki do aplikacji
$exePath = Join-Path $scriptDir "claude-gui\src-tauri\target\release\claude-gui.exe"
$devLauncher = Join-Path $scriptDir "start-gui-dev.cmd"
$prodLauncher = Join-Path $scriptDir "start-gui.cmd"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Claude Code GUI - Shortcut Creator" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Desktop path: $desktopPath"
Write-Host "Script dir: $scriptDir"
Write-Host ""

# Skrot do produkcyjnej wersji
$shortcutPath = Join-Path $desktopPath "Claude Code GUI.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)

if (Test-Path $exePath) {
    Write-Host "[INFO] Znaleziono zbudowana aplikacje: $exePath" -ForegroundColor Green
    $shortcut.TargetPath = $exePath
    $shortcut.IconLocation = $exePath
} else {
    Write-Host "[WARN] Brak .exe - skrot wskazuje na launcher" -ForegroundColor Yellow
    $shortcut.TargetPath = $prodLauncher
}

$shortcut.WorkingDirectory = $scriptDir
$shortcut.Description = "Claude Code GUI - Desktop Application"
$shortcut.Save()
Write-Host "[OK] Utworzono: $shortcutPath" -ForegroundColor Green

# Skrot do trybu developerskiego
$devShortcutPath = Join-Path $desktopPath "Claude Code GUI (Dev).lnk"
$devShortcut = $shell.CreateShortcut($devShortcutPath)
$devShortcut.TargetPath = "cmd.exe"
$devShortcut.Arguments = "/k `"cd /d $scriptDir\claude-gui && npm run tauri dev`""
$devShortcut.WorkingDirectory = "$scriptDir\claude-gui"
$devShortcut.Description = "Claude Code GUI - Development Mode with Hot Reload"
$devShortcut.Save()
Write-Host "[OK] Utworzono: $devShortcutPath" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Gotowe! Skroty na pulpicie:" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  [1] Claude Code GUI       - Produkcyjna wersja" -ForegroundColor White
Write-Host "  [2] Claude Code GUI (Dev) - Tryb deweloperski" -ForegroundColor White
Write-Host ""
