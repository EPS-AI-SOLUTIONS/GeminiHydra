# ═══════════════════════════════════════════════════════════════════════════════
# GEMINI CLI - HYDRA LAUNCHER v3.0 (The Witcher Edition)
# Features: Auto-Resume, Auto-Restart, Robust Ollama, Agent Swarm
# ═══════════════════════════════════════════════════════════════════════════════

$script:ProjectRoot = 'C:\Users\BIURODOM\Desktop\GeminiCLI'
Set-Location $script:ProjectRoot
$Host.UI.RawUI.WindowTitle = 'Gemini CLI (HYDRA - Witcher Edition)'

# Use explicit path since $PSScriptRoot can be empty when dot-sourced
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { $script:ProjectRoot }
$env:GEMINI_HOME = Join-Path $scriptDir '.gemini'
$env:XDG_CONFIG_HOME = $scriptDir

# === AUTO-RESUME CHECK ===
$resumeFile = Join-Path $env:GEMINI_HOME "resume.flag"
if (Test-Path $resumeFile) {
    Write-Host "[HYDRA] Resuming previous session..." -ForegroundColor Yellow
    Remove-Item $resumeFile -Force -ErrorAction SilentlyContinue
}

# === LOAD MODULES ===
$guiModule = Join-Path $scriptDir 'modules\GUI-Utils.psm1'
if (Test-Path $guiModule) { Import-Module $guiModule -Force -Global -ErrorAction SilentlyContinue }

# Load custom profile & env
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

# === MAIN LOOP (AUTO-RESTART) ===
while ($true) {
    Clear-Host
    Show-HydraLogo -Variant 'gemini'
    
    Write-Host "       GEMINI CLI" -NoNewline -ForegroundColor Cyan
    Write-Host " + " -NoNewline -ForegroundColor DarkGray
    Write-Host "HYDRA 10.3" -ForegroundColor DarkCyan
    Write-Host "       Agent Swarm | Witcher Protocols | AI Handler v2.0" -ForegroundColor DarkGray
    Write-Host ""

    # === ROBUST OLLAMA CHECK ===
    $ollamaUrl = "http://localhost:11434"
    $ollamaRunning = $false
    
    Write-Host "  Checking Neural Core (Ollama)..." -NoNewline -ForegroundColor DarkGray
    
    # Try HTTP check first (fastest)
    try {
        $null = Invoke-WebRequest -Uri $ollamaUrl -Method Head -TimeoutSec 1 -ErrorAction Stop
        $ollamaRunning = $true
        Write-Host " [ONLINE]" -ForegroundColor Green
    } catch {
        # Try finding process
        if (Get-Process "ollama" -ErrorAction SilentlyContinue) {
            $ollamaRunning = $true
            Write-Host " [PROCESS ACTIVE]" -ForegroundColor Yellow
        } else {
            Write-Host " [OFFLINE]" -ForegroundColor Red
            Write-Host "  Igniting Neural Core..." -ForegroundColor Yellow
            $ollamaPath = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
            if (Test-Path $ollamaPath) {
                Start-Process -FilePath $ollamaPath -ArgumentList "serve" -WindowStyle Hidden
                
                # Wait loop
                $retries = 10
                while ($retries -gt 0) {
                    Write-Host "." -NoNewline -ForegroundColor DarkGray
                    Start-Sleep -Milliseconds 500
                    try { 
                        $null = Invoke-WebRequest -Uri $ollamaUrl -Method Head -TimeoutSec 1 -ErrorAction Stop
                        $ollamaRunning = $true
                        break
                    } catch {}
                    $retries--
                }
                
                if ($ollamaRunning) { Write-Host " [READY]" -ForegroundColor Green }
                else { Write-Host " [FAILED - Proceeding anyway]" -ForegroundColor Red }
            } else {
                Write-Host "  [WARNING] Ollama executable not found at default location." -ForegroundColor Red
            }
        }
    }

    Write-Separator -Width 55

    # === AI HANDLER INIT ===
    $aiHandlerInit = Join-Path $script:ProjectRoot 'ai-handler\Initialize-AIHandler.ps1'
    if (Test-Path $aiHandlerInit) {
        . $aiHandlerInit -ErrorAction SilentlyContinue
    }

    # === STATUS MONITOR ===
    $monitorScript = Join-Path $scriptDir 'Start-StatusMonitor.ps1'
    if (Test-Path $monitorScript) {
        if (-not (Get-Process -Name "powershell" | Where-Object { $_.MainWindowTitle -like "*HYDRA Monitor*" })) {
            Start-Process powershell -ArgumentList "-NoExit", "-File", "`"$monitorScript`"" -WindowStyle Normal
        }
    }

    # === LAUNCH GEMINI ===
    Write-Host ""
    Write-Host "  Protocol: AgentSwarm (Default)" -ForegroundColor Cyan
    Write-Host "  Status:   Autonomous Mode" -ForegroundColor Green
    Write-Host ""
    
    try {
        # Check if node modules installed
        if (-not (Test-Path "node_modules")) {
            Write-Host "Installing dependencies..." -ForegroundColor Yellow
            npm install --silent
        }
        
        # Launch Node process
        # We use 'node src/server.js' or 'npm start' depending on package.json, but 'gemini' alias works too.
        # However, to be safe, let's use the direct entry point if possible or the alias.
        
        if (Get-Command "gemini" -ErrorAction SilentlyContinue) {
            gemini
        } else {
            node src/server.js
        }
    } catch {
        Write-Host "CRITICAL ERROR: $_" -ForegroundColor Red
        Start-Sleep -Seconds 5
    }

    Write-Host "`n[HYDRA] Session ended. Auto-restarting in 3 seconds..." -ForegroundColor DarkGray
    Write-Host "(Press Ctrl+C to abort)" -ForegroundColor DarkGray
    Start-Sleep -Seconds 3
}