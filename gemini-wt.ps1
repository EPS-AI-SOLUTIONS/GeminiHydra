# GeminiHydra - Windows Terminal Launcher (PowerShell version)
# Fix #10: Windows Terminal provides better stdin handling than cmd.exe

param(
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Arguments
)

# UTF-8 Encoding Fix: Ensure Polish characters display correctly
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Check if Windows Terminal is available
$wt = Get-Command wt -ErrorAction SilentlyContinue

if ($wt) {
    # Launch in new Windows Terminal tab
    $argsString = if ($Arguments) { $Arguments -join ' ' } else { '' }
    Start-Process wt -ArgumentList "-d `"$ScriptDir`" pwsh -NoExit -Command `"npm start -- $argsString`""
} else {
    Write-Host "Windows Terminal not found. Running in current terminal." -ForegroundColor Yellow
    Write-Host "For best experience, install Windows Terminal from Microsoft Store." -ForegroundColor Gray
    Write-Host ""

    # Run in current terminal
    Push-Location $ScriptDir
    try {
        if ($Arguments) {
            npm start -- @Arguments
        } else {
            npm start
        }
    } finally {
        Pop-Location
    }
}
