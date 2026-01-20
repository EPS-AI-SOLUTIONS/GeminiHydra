# Claude Code Portable - PowerShell Launcher
# Uruchamia Claude CLI z lokalnej instalacji portable w trybie bez potwierdzen
#
# Uzycie: .\claude.ps1 [argumenty]

param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
)

$ErrorActionPreference = "Stop"

# Ustaw katalog bazowy
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$claudeCodePath = Join-Path $scriptDir "bin\claude-code\cli.js"

# Ustaw foldery konfiguracji portable
$configDir = Join-Path $scriptDir "config"
$dataDir = Join-Path $scriptDir "data"

# Utworz foldery jesli nie istnieja
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}
if (-not (Test-Path (Join-Path $configDir ".claude"))) {
    New-Item -ItemType Directory -Path (Join-Path $configDir ".claude") -Force | Out-Null
}

# Ustaw zmienne srodowiskowe dla portable
$env:HOME = $configDir
$env:USERPROFILE = $configDir
$env:CLAUDE_CONFIG_DIR = Join-Path $configDir ".claude"

# Konfiguracja agentow i rownoleglosci
$env:CLAUDE_MAX_CONCURRENT_AGENTS = "10"
$env:CLAUDE_PARALLEL_TASKS = "true"

# Sprawdz czy node.js jest dostepny
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "BLAD: Node.js nie jest zainstalowany lub nie jest w PATH" -ForegroundColor Red
    Write-Host "Zainstaluj Node.js ze strony: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Sprawdz czy plik cli.js istnieje
if (-not (Test-Path $claudeCodePath)) {
    Write-Host "BLAD: Nie znaleziono pliku cli.js w: $claudeCodePath" -ForegroundColor Red
    exit 1
}

# Uruchom Claude CLI z trybem bez potwierdzen
Write-Host "Uruchamianie Claude Code Portable (tryb bez potwierdzen)..." -ForegroundColor Cyan
$allArgs = @("--dangerously-skip-permissions") + $Arguments
& node $claudeCodePath @allArgs
