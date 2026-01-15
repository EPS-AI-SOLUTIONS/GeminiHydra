# cspell:ignore LASTEXITCODE OPENAI wrappera
# PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP
# GEMINI CLI - HYDRA LAUNCHER v3.3
# PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP

param(
    [switch]$Yolo,
    [switch]$Turbo,
    [switch]$Debug
)

$ErrorActionPreference = "Continue"

# --- CONFIGURATION ---
$env:HYDRA_YOLO_MODE = if ($Yolo) { 'true' } else { 'false' }
$env:HYDRA_DEEP_THINKING = 'true'
$env:HYDRA_DEEP_RESEARCH = 'true'
$env:HYDRA_TURBO_MODE = if ($Turbo) { 'true' } else { 'false' }

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
$Host.UI.RawUI.WindowTitle = if ($Debug) { 'Gemini CLI (HYDRA - Debug Mode)' } else { 'Gemini CLI (HYDRA)' }

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

function Get-RunningMcpServer {
    try {
        $processes = Get-CimInstance -ClassName Win32_Process -Filter "Name='node.exe'" -ErrorAction Stop
    }
    catch {
        return $null
    }

    foreach ($proc in $processes) {
        $cmd = $proc.CommandLine
        if ($cmd -and ($cmd -match 'src[\\/]+server\.js')) {
            return $proc
        }
    }
    return $null
}

# === MAIN LOOP ===
while ($true) {
    Clear-Host
    Write-Host (if ($Debug) { "GEMINI CLI (HYDRA DEBUG)" } else { "GEMINI CLI (HYDRA)" }) -ForegroundColor Cyan
    Write-Host "------------------------" -ForegroundColor DarkGray

    # === OLLAMA CHECK ===
    $ollamaUrl = if ($env:OLLAMA_HOST) { $env:OLLAMA_HOST } else { "http://localhost:11434" }
    
    Write-Host "  1. Sprawdzanie Ollama..." -NoNewline -ForegroundColor DarkGray
    
    $ollamaOnline = $false
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            $null = Invoke-WebRequest -Uri $ollamaUrl -Method Head -TimeoutSec 2 -ErrorAction Stop
            $ollamaOnline = $true
            break
        }
        catch {
            Write-Host " [PRÓBA $attempt/3]" -ForegroundColor Yellow
            Start-Sleep -Milliseconds 500
        }
    }

    if ($ollamaOnline) {
        Write-Host " [ONLINE]" -ForegroundColor Green
    }
    else {
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
    $serverStartedInBackground = $false

    try {
        Write-Host "     Uruchamianie MCP servera (node src/server.js)..." -ForegroundColor DarkGray
        $ollamaStatus = 'OFFLINE'
        try {
            $null = Invoke-WebRequest -Uri $ollamaUrl -Method Head -TimeoutSec 2 -ErrorAction Stop
            $ollamaStatus = 'ONLINE'
        }
        catch {}
        $existingServer = Get-RunningMcpServer
        if ($existingServer) {
            Write-Host "[HYDRA 🐉] MCP Server już działa" -ForegroundColor Yellow
            Write-Host "   ➤ PID: $($existingServer.ProcessId)" -ForegroundColor Yellow
            Write-Host "   ➤ Ollama: $ollamaStatus" -ForegroundColor Yellow
            $serverStartedInBackground = $true
        }
        else {
            Write-Host "[HYDRA 🐉] MCP Server startuje" -ForegroundColor Green
            Write-Host "   ➤ Nasłuchuje na stdio – podłącz Gemini CLI lub Ctrl+C aby zatrzymać" -ForegroundColor Cyan
            Write-Host "   ➤ Ollama: $ollamaStatus" -ForegroundColor Yellow
            if ($Debug) {
                $serverProcess = Start-Process -FilePath "node" -ArgumentList "src/server.js" -WorkingDirectory $script:ProjectRoot -PassThru -WindowStyle Normal
                $serverStartedInBackground = $true
                Write-Host "   ➤ MCP server uruchomiony w nowym oknie (PID $($serverProcess.Id))" -ForegroundColor Green
            }
            else {
                node src/server.js
                if ($LASTEXITCODE -ne 0) {
                    throw "Node zakończony kodem $LASTEXITCODE."
                }
            }
        }
    }
    catch {
        Write-Host "!!! KRYTYCZNY BŁĄD !!!" -ForegroundColor Red
        Write-Host $_ -ForegroundColor Red
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
        Start-Sleep -Seconds 10
    }

    if ($serverStartedInBackground) {
        Write-Host "`n[HYDRA] Naciśnij Enter, aby wrócić do menu..." -ForegroundColor DarkGray
        Read-Host | Out-Null
        continue
    }

    Write-Host "`n[HYDRA] Restart za 3 sekundy..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 3
}
