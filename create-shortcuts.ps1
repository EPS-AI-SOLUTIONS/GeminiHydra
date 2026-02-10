# Skrypt tworzący skróty na pulpicie
$WshShell = New-Object -ComObject WScript.Shell
$Desktop = [Environment]::GetFolderPath('Desktop')
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Skrót CLI
$ShortcutCLI = $WshShell.CreateShortcut("$Desktop\GeminiHydra CLI.lnk")
$ShortcutCLI.TargetPath = "$ProjectDir\GeminiHydra.bat"
$ShortcutCLI.WorkingDirectory = $ProjectDir
$ShortcutCLI.Description = "GeminiHydra CLI - Wolf Swarm v14.0"
$ShortcutCLI.Save()
Write-Host "Utworzono: GeminiHydra CLI.lnk" -ForegroundColor Green

# Skrót GUI
$ShortcutGUI = $WshShell.CreateShortcut("$Desktop\GeminiHydra GUI.lnk")
$ShortcutGUI.TargetPath = "$ProjectDir\launch-gui.bat"
$ShortcutGUI.WorkingDirectory = "$ProjectDir\GeminiGUI"
$ShortcutGUI.Description = "GeminiHydra GUI - Tauri Application"
$ShortcutGUI.Save()
Write-Host "Utworzono: GeminiHydra GUI.lnk" -ForegroundColor Green

Write-Host "`nSkroty zostaly utworzone na pulpicie!" -ForegroundColor Cyan
