# Gemini CLI - Portable Launcher (PowerShell)
# Uruchom ten skrypt, aby uruchomic Gemini CLI
param(
    [string]$Objective
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Import AgentSwarm v3.0
if (Test-Path "$ScriptDir\AgentSwarm.psm1") {
    Write-Host "Importing Agent Swarm Protocols..." -ForegroundColor Gray
    Import-Module "$ScriptDir\AgentSwarm.psm1" -Force
    if (Test-Path "$ScriptDir\GeminiExtras.psm1") {
        Import-Module "$ScriptDir\GeminiExtras.psm1" -Force
    }
    if (Test-Path "$ScriptDir\GeminiRAG.psm1") {
        Import-Module "$ScriptDir\GeminiRAG.psm1" -Force
    }
} else {
    Write-Error "CRITICAL: AgentSwarm.psm1 not found!"
    exit 1
}

# Interactive Mode
if ([string]::IsNullOrWhiteSpace($Objective)) {
    Write-Host "--- GeminiHydra Swarm Interface ---" -ForegroundColor Cyan
    $Objective = Read-Host "Enter your objective (or 'exit')"
}

if ($Objective -eq 'exit') { exit }

if (-not [string]::IsNullOrWhiteSpace($Objective)) {
    Invoke-AgentSwarm -Objective $Objective
}

