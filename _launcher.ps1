# cspell:ignore LASTEXITCODE OPENAI wrappera
# PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP
# GEMINI CLI - HYDRA LAUNCHER v3.3 (Polished Debug Edition)
# PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP

param(
    [switch]$Yolo,
    [switch]$Turbo
)

$ErrorActionPreference = "Continue" # [DEBUG] Pokazuj wszystkie błędy

# --- CONFIGURATION ---
$env:HYDRA_YOLO_MODE = 'true'
$env:HYDRA_DEEP_THINKING = 'true'
$env:HYDRA_DEEP_RESEARCH = 'true'
$env:HYDRA_TURBO_MODE = if ($Turbo) { 'true' } else { 'false' }

if ($Yolo) { $env:HYDRA_YOLO_MODE = 'true' }

# === PATH RESOLUTION ===
$script:ProjectRoot = if ($PSScriptRoot) { $PSScriptRoot } else { $PWD.Path }
Set-Location $script:ProjectRoot
$scriptDir = $script:ProjectRoot

# [FIX] Ładowanie lokalnego Node.js (jeśli istnieje - naprawia błąd Win32)
$hydraBin = Join-Path $scriptDir ".hydra-bin"
if (Test-Path $hydraBin) {
    Write-Host "[INIT] Wykryto lokalny Node.js w .hydra-bin" -ForegroundColor DarkGray
    $env:Path = "$hydraBin;$env:Path"
}

# === GIT AUTO-UPDATE (VERBOSE) ===
if (Test-Path (Join-Path $scriptDir ".git")) {
    Write-Host "  ➤ Sprawdzanie aktualizacji (Git)..." -NoNewline -ForegroundColor Cyan
    try {
        git fetch origin
        $gitStatus = git status -uno
        
        if ($gitStatus -match "behind") {
            Write-Host " [NOWA WERSJA]" -ForegroundColor Yellow
            Write-Host "  Pobieranie zmian..." -ForegroundColor Cyan
            git pull --ff-only
        }
        else {
            Write-Host " [OK]" -ForegroundColor Green
        }
    }
    catch {
        Write-Host " [BŁĄD GITA - POMIJAM]" -ForegroundColor Red
    }
}

# === WINDOW CONFIGURATION ===
$Host.UI.RawUI.WindowTitle = 'Gemini CLI (HYDRA - Debug Mode)'

# Icon Setup
try {
    $iconPath = Join-Path $scriptDir 'icon.ico'
    if (Test-Path $iconPath) {
        Add-Type -AssemblyName System.Drawing, System.Windows.Forms
        $hwnd = (Get-Process -Id $PID).MainWindowHandle
        $icon = [System.Drawing.Icon]::new($iconPath)
        $form = [System.Windows.Forms.Form]::FromHandle($hwnd)
        if ($form) { $form.Icon = $icon }
    }
}
catch {}

$env:GEMINI_HOME = Join-Path $scriptDir '.gemini'
$env:XDG_CONFIG_HOME = $scriptDir

# === AUTO-RESUME ===
$resumeFile = Join-Path $env:GEMINI_HOME "resume.flag"
if (Test-Path $resumeFile) {
    Remove-Item $resumeFile -Force -ErrorAction SilentlyContinue
}

# === LOAD MODULES ===
$guiModule = Join-Path $scriptDir 'modules\GUI-Utils.psm1'
if (Test-Path $guiModule) { Import-Module $guiModule -Force -Global -ErrorAction SilentlyContinue }

# Load profile & env
$customProfile = Join-Path $scriptDir 'profile.ps1'
if (Test-Path $customProfile) { . $customProfile }

$envFile = Join-Path $scriptDir '.env'
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^#=]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim().Trim('"').Trim("'"), 'Process')
        }
    }
}

# === MAIN LOOP ===
while ($true) {
    Clear-Host
    Write-Host "GEMINI CLI (HYDRA DEBUG)" -ForegroundColor Cyan
    Write-Host "------------------------" -ForegroundColor DarkGray

    # === OLLAMA CHECK ===
    $ollamaUrl = "http://localhost:11434"
    
    Write-Host "  1. Sprawdzanie Ollama..." -NoNewline -ForegroundColor DarkGray
    
    try {
        $null = Invoke-WebRequest -Uri $ollamaUrl -Method Head -TimeoutSec 2 -ErrorAction Stop
        Write-Host " [ONLINE]" -ForegroundColor Green
    }
    catch {
        Write-Host " [OFFLINE - Próba startu]" -ForegroundColor Yellow
        
        $ollamaPath = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
        if (-not (Test-Path $ollamaPath)) {
            $cmd = Get-Command "ollama" -ErrorAction SilentlyContinue
            if ($cmd) { $ollamaPath = $cmd.Source }
        }

        if ($ollamaPath -and (Test-Path $ollamaPath)) {
            Start-Process -FilePath $ollamaPath -ArgumentList "serve" -WindowStyle Hidden
            Start-Sleep -Seconds 3
            Write-Host " [URUCHOMIONO]" -ForegroundColor Green
        }
        else {
            Write-Host " [BRAK OLLAMA]" -ForegroundColor Red
        }
    }

    # === NODE DEPS ===
    Write-Host "  2. Sprawdzanie zależności (NPM)..." -ForegroundColor DarkGray
    if (-not (Test-Path "node_modules")) {
        Write-Host "     Instalowanie node_modules..." -ForegroundColor Yellow
        npm install
    }
    else {
        Write-Host "     [OK] node_modules istnieją" -ForegroundColor Green
    }

    # === LAUNCH ===
    Write-Host "  3. Startowanie silnika..." -ForegroundColor Cyan
    
    try {
        $fallbackWrapper = Join-Path $script:ProjectRoot 'Invoke-GeminiWithFallback.ps1'
        
        if (Test-Path $fallbackWrapper) {
            Write-Host "     Uruchamianie wrappera..." -ForegroundColor DarkGray
            & $fallbackWrapper -Interactive -MaxRetries 3 -RetryDelayMs 2000
        }
        else {
            Write-Host "     Wrapper nie znaleziony! Próba bezpośrednia..." -ForegroundColor Red
            node src/server.js
        }
        Write-Host "[HYDRA 🐉] MCP Server uruchomiony – wersja $SERVER_VERSION" -ForegroundColor Green
        Write-Host "   ➤ Nasłuchuje na stdio – podłącz Gemini CLI lub Ctrl+C aby zatrzymać" -ForegroundColor Cyan
        Write-Host "   ➤ Ollama: $(if (Test-Path 'http://localhost:11434') {'ONLINE'} else {'OFFLINE'})" -ForegroundColor Yellow
    }
    catch {
        Write-Host "!!! KRYTYCZNY BŁĄD !!!" -ForegroundColor Red
        Write-Host $_ -ForegroundColor Red
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
        Start-Sleep -Seconds 10
    }

    Write-Host "`n[HYDRA] Restart za 3 sekundy..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 3
}