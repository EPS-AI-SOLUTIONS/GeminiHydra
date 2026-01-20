# Tworzenie skrotu na pulpicie
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("C:\Users\BIURODOM\Desktop\Claude Code Portable.lnk")
$Shortcut.TargetPath = "C:\Users\BIURODOM\Desktop\ClaudeCli\claude.cmd"
$Shortcut.WorkingDirectory = "C:\Users\BIURODOM\Desktop\ClaudeCli"
$Shortcut.IconLocation = "C:\Users\BIURODOM\Desktop\ClaudeCli\icon.ico"
$Shortcut.Description = "Claude Code Portable - AI Assistant"
$Shortcut.Save()
Write-Host "Skrot utworzony pomyslnie!" -ForegroundColor Green
