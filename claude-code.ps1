# GeminiHydra - Claude Code Launcher

# UTF-8 Encoding Fix: Ensure Polish characters display correctly
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$logFile = "C:\Users\BIURODOM\Desktop\GeminiHydra\claude-launcher.log"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp | $Message" | Out-File -FilePath $logFile -Append -Encoding UTF8
}

Write-Log "========== NOWA SESJA =========="
$Host.UI.RawUI.WindowTitle = "GeminiHydra - Claude Code"
Set-Location "C:\Users\BIURODOM\Desktop\GeminiHydra"

Write-Log "Uruchamiam Claude Code (bezposrednio)..."

# Uruchom Claude Code BEZPOSREDNIO w tym samym terminalu
& "C:\Users\BIURODOM\AppData\Roaming\npm\claude.cmd"

Write-Log "Claude Code zakonczyl sie z kodem: $LASTEXITCODE"

Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "  [Enter] Uruchom ponownie | [Q] Zamknij" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Yellow

$key = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
Write-Log "Klawisz: $($key.Character)"
Write-Log "========== KONIEC =========="
