$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("C:\Users\BIURODOM\Desktop\Claude HYDRA.lnk")
$Shortcut.TargetPath = "C:\Users\BIURODOM\Desktop\ClaudeCli\claude-gui\run-claude-gui.bat"
$Shortcut.WorkingDirectory = "C:\Users\BIURODOM\Desktop\ClaudeCli\claude-gui"
$Shortcut.IconLocation = "C:\Users\BIURODOM\Desktop\ClaudeCli\claude-gui\src-tauri\icons\icon.ico"
$Shortcut.Description = "Claude HYDRA - AI Swarm Control Center"
$Shortcut.Save()
Write-Host "Shortcut created successfully!"
