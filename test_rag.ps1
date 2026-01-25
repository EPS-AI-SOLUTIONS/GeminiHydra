# Test RAG System
$ScriptDir = $PSScriptRoot
Import-Module "$ScriptDir\GeminiRAG.psm1" -Force

Write-Host "1. Initializing RAG..." -ForegroundColor Yellow
Initialize-RAG

Write-Host "2. Adding Memory..." -ForegroundColor Yellow
Add-Memory -Content "GeminiHydra to autonomiczny system roju agentów oparty na PowerShell." -Metadata @{ category = "definition" }
Add-Memory -Content "Wiedźmin Geralt to główny bohater sagi Sapkowskiego." -Metadata @{ category = "lore" }

Write-Host "`n3. Searching for: 'na czym oparty jest system?'" -ForegroundColor Yellow
$results = Search-Memory -Query "na czym oparty jest system?" -TopK 1

Write-Host "`n--- RESULTS ---" -ForegroundColor Green
$results | Format-List
