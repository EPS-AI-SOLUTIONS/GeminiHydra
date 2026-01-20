$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = "C:\Users\BIURODOM\Desktop"
$Shortcut = $WshShell.CreateShortcut("$DesktopPath\Claude GUI.lnk")
$Shortcut.TargetPath = "$PSScriptRoot\claude-gui\src-tauri\target\release\claude-gui.exe"
$Shortcut.WorkingDirectory = "$PSScriptRoot"
$Shortcut.IconLocation = "$PSScriptRoot\icon.ico"
$Shortcut.Description = "Claude Code GUI"
$Shortcut.Save()
Write-Host "Skrot utworzony: $DesktopPath\Claude GUI.lnk"
