# Create-Shortcut.ps1
# Creates a desktop shortcut for GeminiCLI

$scriptDir = $PSScriptRoot
$targetPath = Join-Path $scriptDir "GeminiCLI.vbs"
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) "Gemini CLI.lnk"
$iconPath = Join-Path $scriptDir "icon.ico"

if (-not (Test-Path $targetPath)) {
    Write-Error "Target script 'GeminiCLI.vbs' not found in script directory."
    exit 1
}

if (-not (Test-Path $iconPath)) {
    Write-Warning "Icon file 'icon.ico' not found. Shortcut will have default icon."
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)

$shortcut.TargetPath = $targetPath
$shortcut.IconLocation = $iconPath
$shortcut.Description = "Launch Gemini CLI (HYDRA Edition)"
$shortcut.WorkingDirectory = $scriptDir

$shortcut.Save()

Write-Host "Shortcut 'Gemini CLI.lnk' created on your desktop." -ForegroundColor Green
