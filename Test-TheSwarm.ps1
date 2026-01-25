# Test-TheSwarm.ps1
# Automatic Swarm Test (English to avoid encoding issues)

$ScriptDir = $PSScriptRoot
Set-Location $ScriptDir

Write-Host "--- [TEST START] Loading Modules ---" -ForegroundColor Cyan
Import-Module "$ScriptDir\AgentSwarm.psm1" -Force
Import-Module "$ScriptDir\GeminiExtras.psm1" -Force
Import-Module "$ScriptDir\GeminiRAG.psm1" -Force

# 1. Stats Test
Write-Host "`n--- [TEST 1] LLM Stats (Real Log Analysis) ---" -ForegroundColor Cyan
Show-LLMStats

# 2. Swarm Test
Write-Host "`n--- [TEST 2] Invoking The Wolf Swarm ---" -ForegroundColor Cyan
$Objective = "Analyze GeminiExtras.psm1 for security and code readability. List 3 improvements."

Write-Host "Objective: $Objective" -ForegroundColor Yellow

try {
    Invoke-AgentSwarm -Objective $Objective -Yolo
} catch {
    Write-Error "Swarm Failure: $_"
}

Write-Host "`n--- [TEST END] ---" -ForegroundColor Cyan