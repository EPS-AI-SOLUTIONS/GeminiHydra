#Requires -Version 5.1
<#
.SYNOPSIS
    AgentSwarm Launcher with Auto-Detect, Auto-Resume, Auto-Restart

.DESCRIPTION
    Intelligent launcher for AgentSwarm v3.0 with:
    - Auto-detect Ollama and start if needed
    - Auto-resume interrupted sessions
    - YOLO mode support
    - MCP integration detection

.PARAMETER Query
    The query to process

.PARAMETER Yolo
    Enable YOLO mode (fast & dangerous)

.PARAMETER Interactive
    Start in interactive mode

.PARAMETER Resume
    Resume last interrupted session

.PARAMETER Status
    Show system status only

.EXAMPLE
    .\_launcher.ps1 -Query "Explain closures in JavaScript"
    .\_launcher.ps1 -Yolo -Query "Quick task"
    .\_launcher.ps1 -Interactive
    .\_launcher.ps1 -Status
#>

param(
    [string]$Query,
    [switch]$Yolo,
    [switch]$Interactive,
    [switch]$Resume,
    [switch]$Status
)

$ErrorActionPreference = "Stop"
$ScriptRoot = $PSScriptRoot
$ModulePath = Join-Path $ScriptRoot "AgentSwarm.psm1"
$MemoryPath = Join-Path $ScriptRoot "..\..\..\.serena\memories"
$OllamaUrl = "http://localhost:11434"

# ============================================================================
# BANNER
# ============================================================================

function Show-LauncherBanner {
    $banner = @"

    ╔═══════════════════════════════════════════════════════════════════════╗
    ║                                                                       ║
    ║     █████╗  ██████╗ ███████╗███╗   ██╗████████╗                       ║
    ║    ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝                       ║
    ║    ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║                          ║
    ║    ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║                          ║
    ║    ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║                          ║
    ║    ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝                          ║
    ║                                                                       ║
    ║    ███████╗██╗    ██╗ █████╗ ██████╗ ███╗   ███╗                      ║
    ║    ██╔════╝██║    ██║██╔══██╗██╔══██╗████╗ ████║                      ║
    ║    ███████╗██║ █╗ ██║███████║██████╔╝██╔████╔██║                      ║
    ║    ╚════██║██║███╗██║██╔══██║██╔══██╗██║╚██╔╝██║                      ║
    ║    ███████║╚███╔███╔╝██║  ██║██║  ██║██║ ╚═╝ ██║                      ║
    ║    ╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝                      ║
    ║                                                                       ║
    ║               🐺 School of the Wolf - v3.0 🐺                         ║
    ╚═══════════════════════════════════════════════════════════════════════╝

"@
    Write-Host $banner -ForegroundColor Cyan
}

# ============================================================================
# AUTO-DETECT FUNCTIONS
# ============================================================================

function Test-OllamaRunning {
    try {
        $response = Invoke-RestMethod -Uri "$OllamaUrl/api/tags" -Method Get -TimeoutSec 3 -ErrorAction Stop
        return $true
    }
    catch {
        return $false
    }
}

function Start-OllamaServer {
    Write-Host "[*] Ollama not running. Attempting to start..." -ForegroundColor Yellow

    # Try to start Ollama
    try {
        $ollamaPath = Get-Command "ollama" -ErrorAction SilentlyContinue
        if ($ollamaPath) {
            Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
            Write-Host "[*] Waiting for Ollama to start..." -ForegroundColor Yellow

            # Wait up to 30 seconds
            $maxWait = 30
            $waited = 0
            while (-not (Test-OllamaRunning) -and $waited -lt $maxWait) {
                Start-Sleep -Seconds 1
                $waited++
                Write-Host "." -NoNewline -ForegroundColor Gray
            }
            Write-Host ""

            if (Test-OllamaRunning) {
                Write-Host "[+] Ollama started successfully!" -ForegroundColor Green
                return $true
            }
        }
    }
    catch {
        Write-Host "[!] Failed to start Ollama: $_" -ForegroundColor Red
    }

    return $false
}

function Get-OllamaModels {
    try {
        $response = Invoke-RestMethod -Uri "$OllamaUrl/api/tags" -Method Get -TimeoutSec 5
        return $response.models
    }
    catch {
        return @()
    }
}

function Test-RequiredModels {
    $required = @("llama3.2:1b", "llama3.2:3b", "phi3:mini", "qwen2.5-coder:1.5b")
    $installed = (Get-OllamaModels).name

    $missing = @()
    foreach ($model in $required) {
        if ($model -notin $installed) {
            $missing += $model
        }
    }

    return @{
        Installed = $installed
        Missing   = $missing
        AllPresent = $missing.Count -eq 0
    }
}

function Install-MissingModels {
    param([array]$Models)

    foreach ($model in $Models) {
        Write-Host "[*] Pulling model: $model..." -ForegroundColor Yellow
        try {
            & ollama pull $model
            Write-Host "[+] Model $model installed!" -ForegroundColor Green
        }
        catch {
            Write-Host "[!] Failed to pull $model : $_" -ForegroundColor Red
        }
    }
}

# ============================================================================
# MCP DETECTION
# ============================================================================

function Test-MCPServers {
    $mcpStatus = @{
        Serena           = $false
        DesktopCommander = $false
        Playwright       = $false
    }

    # Check for Serena
    $serenaConfig = Join-Path $ScriptRoot "..\..\..\.serena\project.yml"
    if (Test-Path $serenaConfig) {
        $mcpStatus.Serena = $true
    }

    # Check for Desktop Commander (via npx)
    try {
        $npmList = & npx @wonderwhy-er/desktop-commander --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            $mcpStatus.DesktopCommander = $true
        }
    }
    catch { }

    # Check for Playwright
    try {
        $pwVersion = & npx playwright --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            $mcpStatus.Playwright = $true
        }
    }
    catch { }

    return $mcpStatus
}

# ============================================================================
# SESSION MANAGEMENT
# ============================================================================

function Get-LastSession {
    $sessionsPath = Join-Path $MemoryPath "sessions"
    if (-not (Test-Path $sessionsPath)) {
        return $null
    }

    $sessions = Get-ChildItem -Path $sessionsPath -Filter "session_*.md" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    return $sessions
}

function Get-InterruptedSession {
    $swarmMemory = Join-Path $MemoryPath "Swarm.json"
    if (Test-Path $swarmMemory) {
        $memories = Get-Content $swarmMemory -Raw | ConvertFrom-Json
        $last = $memories | Select-Object -Last 1

        # Check if session was completed (has ArchiveFile)
        if ($last -and -not (Test-Path $last.data.ArchiveFile)) {
            return $last.data
        }
    }
    return $null
}

# ============================================================================
# STATUS DISPLAY
# ============================================================================

function Show-SystemStatus {
    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║                    AGENT SWARM SYSTEM STATUS                     ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""

    # Ollama Status
    Write-Host "  OLLAMA SERVER" -ForegroundColor Yellow
    Write-Host "  ─────────────" -ForegroundColor Gray

    if (Test-OllamaRunning) {
        Write-Host "  Status:  " -NoNewline; Write-Host "ONLINE" -ForegroundColor Green
        Write-Host "  URL:     $OllamaUrl" -ForegroundColor Gray

        $models = Test-RequiredModels
        Write-Host ""
        Write-Host "  MODELS" -ForegroundColor Yellow
        Write-Host "  ──────" -ForegroundColor Gray

        foreach ($model in $models.Installed) {
            $icon = if ($model -in @("llama3.2:1b", "llama3.2:3b", "phi3:mini", "qwen2.5-coder:1.5b")) { "[+]" } else { "[ ]" }
            Write-Host "  $icon $model" -ForegroundColor $(if ($icon -eq "[+]") { "Green" } else { "Gray" })
        }

        if ($models.Missing.Count -gt 0) {
            Write-Host ""
            Write-Host "  MISSING MODELS" -ForegroundColor Red
            foreach ($model in $models.Missing) {
                Write-Host "  [!] $model" -ForegroundColor Red
            }
        }
    }
    else {
        Write-Host "  Status:  " -NoNewline; Write-Host "OFFLINE" -ForegroundColor Red
    }

    # MCP Status
    Write-Host ""
    Write-Host "  MCP SERVERS" -ForegroundColor Yellow
    Write-Host "  ───────────" -ForegroundColor Gray

    $mcp = Test-MCPServers
    foreach ($server in $mcp.Keys) {
        $status = if ($mcp[$server]) { "[+] Available" } else { "[-] Not Found" }
        $color = if ($mcp[$server]) { "Green" } else { "Gray" }
        Write-Host "  $server : " -NoNewline; Write-Host $status -ForegroundColor $color
    }

    # Last Session
    Write-Host ""
    Write-Host "  LAST SESSION" -ForegroundColor Yellow
    Write-Host "  ────────────" -ForegroundColor Gray

    $lastSession = Get-LastSession
    if ($lastSession) {
        Write-Host "  File:    $($lastSession.Name)" -ForegroundColor Gray
        Write-Host "  Date:    $($lastSession.LastWriteTime)" -ForegroundColor Gray
    }
    else {
        Write-Host "  No sessions found" -ForegroundColor Gray
    }

    # Interrupted Session
    $interrupted = Get-InterruptedSession
    if ($interrupted) {
        Write-Host ""
        Write-Host "  [!] INTERRUPTED SESSION DETECTED" -ForegroundColor Yellow
        Write-Host "  Session ID: $($interrupted.SessionId)" -ForegroundColor Yellow
        Write-Host "  Query:      $($interrupted.Query)" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║  Use -Interactive for interactive mode, -Yolo for YOLO mode      ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

# ============================================================================
# INTERACTIVE MODE
# ============================================================================

function Start-InteractiveMode {
    param([switch]$Yolo)

    Show-LauncherBanner

    if ($Yolo) {
        Write-Host "  ⚠️  YOLO MODE ACTIVE - Fast & Dangerous ⚠️" -ForegroundColor Red
        Write-Host ""
    }

    # Import module
    Import-Module $ModulePath -Force

    if ($Yolo) {
        Enable-YoloMode
    }

    Write-Host "  Type your query and press Enter. Type 'exit' to quit." -ForegroundColor Gray
    Write-Host "  Commands: /status, /yolo, /safe, /models, /help, /exit" -ForegroundColor Gray
    Write-Host ""

    while ($true) {
        $modeIndicator = if ($Yolo -or (Get-YoloStatus).YoloMode) { "[YOLO]" } else { "[SAFE]" }
        Write-Host "$modeIndicator " -NoNewline -ForegroundColor $(if ($modeIndicator -eq "[YOLO]") { "Red" } else { "Green" })
        $input = Read-Host "Query"

        switch -Regex ($input.Trim()) {
            '^/exit$|^exit$|^quit$' {
                Write-Host "Farewell, Witcher!" -ForegroundColor Cyan
                return
            }
            '^/status$' {
                Show-SystemStatus
            }
            '^/yolo$' {
                Enable-YoloMode
                $Yolo = $true
            }
            '^/safe$' {
                Disable-YoloMode
                $Yolo = $false
            }
            '^/models$' {
                $models = Get-OllamaModels
                Write-Host "Installed models:" -ForegroundColor Yellow
                $models | ForEach-Object { Write-Host "  - $($_.name)" -ForegroundColor Gray }
            }
            '^/help$' {
                Write-Host @"

  COMMANDS:
    /status  - Show system status
    /yolo    - Enable YOLO mode (fast & dangerous)
    /safe    - Return to standard mode
    /models  - List installed Ollama models
    /help    - Show this help
    /exit    - Exit interactive mode

  USAGE:
    Just type your query and press Enter to invoke the Swarm!

"@ -ForegroundColor Cyan
            }
            default {
                if ($input.Trim()) {
                    Invoke-AgentSwarm -Query $input -YoloMode:$Yolo
                }
            }
        }
    }
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

Show-LauncherBanner

# Status only
if ($Status) {
    Show-SystemStatus
    exit 0
}

# Auto-detect and start Ollama
Write-Host "[*] Checking Ollama status..." -ForegroundColor Gray
if (-not (Test-OllamaRunning)) {
    $started = Start-OllamaServer
    if (-not $started) {
        Write-Host "[X] Ollama is required but could not be started!" -ForegroundColor Red
        Write-Host "    Please start Ollama manually: ollama serve" -ForegroundColor Yellow
        exit 1
    }
}
else {
    Write-Host "[+] Ollama is running" -ForegroundColor Green
}

# Check required models
$modelCheck = Test-RequiredModels
if (-not $modelCheck.AllPresent) {
    Write-Host "[!] Missing required models: $($modelCheck.Missing -join ', ')" -ForegroundColor Yellow
    $pullChoice = Read-Host "    Pull missing models? (y/N)"
    if ($pullChoice -eq 'y' -or $pullChoice -eq 'Y') {
        Install-MissingModels -Models $modelCheck.Missing
    }
}

# Import module
Write-Host "[*] Loading AgentSwarm module..." -ForegroundColor Gray
Import-Module $ModulePath -Force
Write-Host "[+] AgentSwarm v3.0 loaded" -ForegroundColor Green

# Check for interrupted session
if ($Resume) {
    $interrupted = Get-InterruptedSession
    if ($interrupted) {
        Write-Host "[*] Resuming session: $($interrupted.SessionId)" -ForegroundColor Yellow
        $Query = $interrupted.Query
    }
    else {
        Write-Host "[!] No interrupted session found" -ForegroundColor Yellow
    }
}

# Interactive mode
if ($Interactive) {
    Start-InteractiveMode -Yolo:$Yolo
    exit 0
}

# Execute query
if ($Query) {
    Write-Host ""
    Invoke-AgentSwarm -Query $Query -YoloMode:$Yolo
}
else {
    Write-Host ""
    Write-Host "  Usage:" -ForegroundColor Yellow
    Write-Host "    .\_launcher.ps1 -Query 'Your question here'" -ForegroundColor Gray
    Write-Host "    .\_launcher.ps1 -Yolo -Query 'Fast task'" -ForegroundColor Gray
    Write-Host "    .\_launcher.ps1 -Interactive" -ForegroundColor Gray
    Write-Host "    .\_launcher.ps1 -Status" -ForegroundColor Gray
    Write-Host ""
}
