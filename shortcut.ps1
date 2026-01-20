$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("C:\Users\BIURODOM\Desktop\Claude Code GUI.lnk")
$Shortcut.TargetPath = "C:\Users\BIURODOM\Desktop\ClaudeCli\claude-gui\src-tauri\target\release\claude-gui.exe"
$Shortcut.WorkingDirectory = "C:\Users\BIURODOM\Desktop\ClaudeCli"
$Shortcut.Description = "Claude Code GUI - Auto-Approve Bridge"
$Shortcut.Save()
Write-Host "Skrot utworzony pomyslnie!"
