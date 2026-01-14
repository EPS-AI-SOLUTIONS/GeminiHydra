# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# GEMINI CLI - HYDRA LAUNCHER v3.0 (The Witcher Edition)
# Features: Auto-Resume, Auto-Restart, Robust Ollama, Agent Swarm
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

param(
    [switch]$Yolo,
    [switch]$Turbo  # 4x parallel pipeline mode
)

# --- YOLO MODE DEFAULT ON ---
$env:HYDRA_YOLO_MODE = 'true'
# --- DEEP THINKING & RESEARCH DEFAULT ON ---
$env:HYDRA_DEEP_THINKING = 'true'
$env:HYDRA_DEEP_RESEARCH = 'true'
# --- TURBO MODE (opt-in) ---
$env:HYDRA_TURBO_MODE = if ($Turbo) { 'true' } else { 'false' }
# --------------------------

if ($Yolo) {
    # This switch can still be used, but the default is now on.
    $env:HYDRA_YOLO_MODE = 'true'
}

# === PATH RESOLUTION ===
$script:ProjectRoot = if ($PSScriptRoot) { $PSScriptRoot } else { $PWD.Path }
Set-Location $script:ProjectRoot
$scriptDir = $script:ProjectRoot

# === GIT AUTO-UPDATE ===
if (Test-Path (Join-Path $scriptDir ".git")) {
    Write-Host "  Checking for updates..." -NoNewline -ForegroundColor DarkGray
    try {
        $gitFetch = git fetch origin 2>&1
        $gitStatus = git status -uno 2>&1
        if ($gitStatus -match "behind") {
            Write-Host " [UPDATE AVAILABLE]" -ForegroundColor Yellow
            Write-Host "  Pulling latest changes..." -ForegroundColor Cyan
            $gitPull = git pull --ff-only 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  [OK] Updated successfully" -ForegroundColor Green
            } else {
                Write-Host "  [!] Pull failed - manual merge may be required" -ForegroundColor Red
            }
        } else {
            Write-Host " [UP TO DATE]" -ForegroundColor Green
        }
    } catch {
        Write-Host " [SKIP]" -ForegroundColor DarkGray
    }
}

# === WINDOW CONFIGURATION ===
$Host.UI.RawUI.WindowTitle = 'Gemini CLI (HYDRA - Witcher Edition)'

# Icon Setup (Safe Mode)
try {
    $iconPath = Join-Path $scriptDir 'icon.ico'
    if (Test-Path $iconPath) {
        Add-Type -AssemblyName System.Drawing, System.Windows.Forms
        $hwnd = (Get-Process -Id $PID).MainWindowHandle
        $icon = [System.Drawing.Icon]::new($iconPath)
        $form = [System.Windows.Forms.Form]::FromHandle($hwnd)
        if ($form) { $form.Icon = $icon }
    }
} catch {
    # Ignore icon errors to prevent crash
}

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
    if (Get-Command Show-HydraLogo -ErrorAction SilentlyContinue) {
        Show-HydraLogo -Variant 'gemini'
    } else {
        Write-Host "GEMINI CLI (HYDRA)" -ForegroundColor Cyan
    }
    
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
            
            # Find Ollama executable
            $ollamaPath = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
            if (-not (Test-Path $ollamaPath)) {
                $ollamaCmd = Get-Command "ollama" -ErrorAction SilentlyContinue
                if ($ollamaCmd) { $ollamaPath = $ollamaCmd.Source }
            }

            if ($ollamaPath -and (Test-Path $ollamaPath)) {
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
                Write-Host "  [WARNING] Ollama executable not found." -ForegroundColor Red
            }
        }
    }

    if (Get-Command Write-Separator -ErrorAction SilentlyContinue) {
        Write-Separator -Width 55
    } else {
        Write-Host ("-" * 55) -ForegroundColor DarkGray
    }

    # === AI HANDLER INIT ===
    $aiHandlerInit = Join-Path $script:ProjectRoot 'ai-handler\Initialize-AIHandler.ps1'
    if (Test-Path $aiHandlerInit) {
        try {
            . $aiHandlerInit
        } catch {}
    }

    # === AI MODEL DISCOVERY (Async - non-blocking) ===
    $aiHandlerModule = Join-Path $script:ProjectRoot 'ai-handler\AIModelHandler.psm1'
    if (Test-Path $aiHandlerModule) {
        try {
            Import-Module $aiHandlerModule -Force -ErrorAction SilentlyContinue

            # Check if any API keys are available
            $hasKeys = $env:ANTHROPIC_API_KEY -or $env:OPENAI_API_KEY -or $env:GOOGLE_API_KEY -or $env:GEMINI_API_KEY

            if ($hasKeys -or $ollamaRunning) {
                Write-Host "  AI models: " -NoNewline -ForegroundColor DarkGray
                Write-Host "[lazy-load]" -ForegroundColor DarkCyan
                # NOTE: Model sync is now lazy-loaded on first use for faster startup
                # Call Sync-AIModels manually if immediate sync is needed
            }

            # Show current AI config
            if (Get-Command Show-AIConfig -ErrorAction SilentlyContinue) {
                # Quick status line instead of full config
                $state = Get-AIState -ErrorAction SilentlyContinue
                if ($state) {
                    Write-Host "  AI:       " -NoNewline -ForegroundColor Gray
                    Write-Host "$($state.currentProvider)/" -NoNewline -ForegroundColor DarkCyan
                    Write-Host "$($state.currentModel)" -ForegroundColor Cyan
                }
            }
        } catch {
            # Silently continue
        }
    }

    # === STATUS MONITOR ===
    $monitorScript = Join-Path $scriptDir 'Start-StatusMonitor.ps1'
    if (Test-Path $monitorScript) {
        # Generalized check for any process with the specific window title
        if (-not (Get-Process | Where-Object { $_.MainWindowTitle -like "*HYDRA Monitor*" })) {
            Start-Process powershell -ArgumentList "-NoExit", "-File", "`"$monitorScript`"" -WindowStyle Hidden
        }
    }

    # === TURBO MODE INIT ===
    if ($env:HYDRA_TURBO_MODE -eq 'true') {
        $agentSwarmModule = Join-Path $script:ProjectRoot 'ai-handler\modules\AgentSwarm.psm1'
        if (Test-Path $agentSwarmModule) {
            try {
                Import-Module $agentSwarmModule -Force -ErrorAction SilentlyContinue
                Write-Host "  Turbo:    " -NoNewline -ForegroundColor Gray
                Write-Host "Initializing 4 parallel agents..." -ForegroundColor Magenta
                Initialize-TurboAgents -ErrorAction SilentlyContinue | Out-Null
            } catch {
                Write-Host "  Turbo:    " -NoNewline -ForegroundColor Gray
                Write-Host "[INIT FAILED]" -ForegroundColor Red
            }
        }
    }

    # === LAUNCH GEMINI ===
    Write-Host ""
    Write-Host "  Protocol: AgentSwarm (Default)" -ForegroundColor Cyan
    if ($env:HYDRA_YOLO_MODE -eq 'true') {
        Write-Host "  YOLO:     " -NoNewline -ForegroundColor Gray
        Write-Host "ACTIVE (Fast & Dangerous)" -ForegroundColor Magenta
    }
    if ($env:HYDRA_TURBO_MODE -eq 'true') {
        Write-Host "  TURBO:    " -NoNewline -ForegroundColor Gray
        Write-Host "4x PARALLEL PIPELINE" -ForegroundColor Red
    }
    if ($env:HYDRA_DEEP_THINKING -eq 'true') {
        Write-Host "  Deep:     " -NoNewline -ForegroundColor Gray
        Write-Host "Thinking + Research ENABLED" -ForegroundColor Yellow
    }

    # Show fallback status
    $fallbackProviders = @()
    if ((Test-Path "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe") -or (Get-Command "ollama" -ErrorAction SilentlyContinue)) {
        $fallbackProviders += "Ollama"
    }
    if ($env:ANTHROPIC_API_KEY) { $fallbackProviders += "Claude" }
    if ($env:OPENAI_API_KEY) { $fallbackProviders += "OpenAI" }

    if ($fallbackProviders.Count -gt 0) {
        Write-Host "  Fallback: " -NoNewline -ForegroundColor Gray
        Write-Host ($fallbackProviders -join " -> ") -ForegroundColor DarkCyan
    }
    Write-Host ""

    try {
        # Check if node modules installed
        if (-not (Test-Path "node_modules")) {
            if (Get-Command Show-ProgressAnimation -ErrorAction SilentlyContinue) {
                Show-ProgressAnimation -Message "Installing dependencies" -ScriptBlock {
                    npm install --silent
                }
            } else {
                Write-Host "Installing dependencies..." -ForegroundColor Yellow
                npm install --silent
            }
        }

        # Launch Gemini with fallback wrapper
        $fallbackWrapper = Join-Path $script:ProjectRoot 'Invoke-GeminiWithFallback.ps1'
        if (Test-Path $fallbackWrapper) {
            & $fallbackWrapper -Interactive -MaxRetries 3 -RetryDelayMs 2000
        } elseif (Get-Command "gemini" -ErrorAction SilentlyContinue) {
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

