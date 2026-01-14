$scriptDir = $PSScriptRoot
$statusLineScript = Join-Path $scriptDir ".gemini\statusline.cjs"
$Host.UI.RawUI.WindowTitle = "HYDRA Monitor"

if (-not (Test-Path $statusLineScript)) {
    Write-Error "Status line script not found at $statusLineScript"
    Start-Sleep 5
    exit 1
}

# Set window size to be small and unintrusive
try {
    $Host.UI.RawUI.WindowSize = New-Object System.Management.Automation.Host.Size(80, 5)
    $Host.UI.RawUI.BufferSize = New-Object System.Management.Automation.Host.Size(80, 5)
} catch {}

Clear-Host
Write-Host "HYDRA STATUS MONITOR" -ForegroundColor Cyan -NoNewline
Write-Host " [LIVE]" -ForegroundColor Green

while ($true) {
    try {
        $output = node $statusLineScript 2>&1
        
        # Move cursor to line 2 (leave title)
        [Console]::SetCursorPosition(0, 1)
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host $output.Trim().PadRight(79) -NoNewline
        } else {
            Write-Host "Status Error" -ForegroundColor Red
        }
    } catch {
        # Ignore errors
    }
    Start-Sleep -Milliseconds 2000
}