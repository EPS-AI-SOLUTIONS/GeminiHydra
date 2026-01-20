# Test script for AgentSwarm
Import-Module "$PSScriptRoot\AgentSwarm.psm1" -Force

Write-Host "Testing AgentSwarm v3.0" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan

# Test 1: Ollama Connection
Write-Host "`n[Test 1] Ollama Connection:" -ForegroundColor Yellow
$connected = Test-OllamaConnection
Write-Host "  Connected: $connected" -ForegroundColor $(if ($connected) { "Green" } else { "Red" })

# Test 2: Agent Model Mapping
Write-Host "`n[Test 2] Agent Models:" -ForegroundColor Yellow
@("Ciri", "Regis", "Yennefer", "Geralt") | ForEach-Object {
    $model = Get-AgentModel -Agent $_
    Write-Host "  $_ -> $model" -ForegroundColor Gray
}

# Test 3: Single Agent Task
Write-Host "`n[Test 3] Single Agent Task (Ciri):" -ForegroundColor Yellow
$result = Invoke-AgentTask -Agent "Ciri" -Prompt "What is 2+2? Answer briefly." -TimeoutSec 30
Write-Host "  Success: $($result.Success)" -ForegroundColor $(if ($result.Success) { "Green" } else { "Red" })
Write-Host "  Duration: $([math]::Round($result.Duration, 2))s" -ForegroundColor Gray
if ($result.Success) {
    Write-Host "  Response: $($result.Response.Substring(0, [Math]::Min(100, $result.Response.Length)))..." -ForegroundColor White
}

# Test 4: Prompt Complexity
Write-Host "`n[Test 4] Prompt Complexity Analysis:" -ForegroundColor Yellow
$complexity = Get-PromptComplexity -Prompt "Implement a REST API endpoint for user authentication with JWT tokens"
Write-Host "  Level: $($complexity.Level)" -ForegroundColor Gray
Write-Host "  Score: $($complexity.Score)" -ForegroundColor Gray
Write-Host "  Recommended Agent: $($complexity.RecommendedAgent)" -ForegroundColor Gray

Write-Host "`n========================" -ForegroundColor Cyan
Write-Host "Tests completed!" -ForegroundColor Green
