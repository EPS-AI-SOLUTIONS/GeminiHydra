# ═══════════════════════════════════════════════════════════════════════════════
# GEMINI CLI - HYDRA LAUNCHER v2.2.0
# Enhanced GUI with status monitoring
# ═══════════════════════════════════════════════════════════════════════════════

Set-Location 'C:\Users\BIURODOM\Desktop\GeminiCLI'
$Host.UI.RawUI.WindowTitle = 'Gemini CLI (HYDRA)'

# Set GEMINI_HOME to local .gemini folder
$env:GEMINI_HOME = Join-Path $PSScriptRoot '.gemini'
$env:XDG_CONFIG_HOME = $PSScriptRoot

# Load GUI module
$guiModule = Join-Path $PSScriptRoot 'modules\GUI-Utils.psm1'
if (Test-Path $guiModule) { Import-Module $guiModule -Force }

# Load custom profile
$customProfile = Join-Path $PSScriptRoot 'profile.ps1'
if (Test-Path $customProfile) { . $customProfile }

# Load .env
$envFile = Join-Path $PSScriptRoot '.env'
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -and -not $_.StartsWith('#') -and $_.Contains('=')) {
            $parts = $_.Split('=', 2)
            if ($parts.Count -eq 2) {
                $name = $parts[0].Trim()
                $value = $parts[1].Trim().Trim('"').Trim("'")
                [Environment]::SetEnvironmentVariable($name, $value, 'Process')
            }
        }
    }
}


# === CLEAR & SHOW LOGO ===
Clear-Host
Show-HydraLogo -Variant 'gemini'

Write-Host "       GEMINI CLI" -NoNewline -ForegroundColor Cyan
Write-Host " + " -NoNewline -ForegroundColor DarkGray
Write-Host "HYDRA" -ForegroundColor DarkCyan
Write-Host "       Ollama + Prompt Optimizer + MCP" -ForegroundColor DarkGray
Write-Host ""

# === SYSTEM STATUS ===
Write-Separator -Width 55
$sysInfo = Get-SystemInfo
Write-StatusLine -Label "PowerShell" -Value $sysInfo.PowerShell -Status 'info'
Write-StatusLine -Label "Node.js" -Value $sysInfo.Node -Status 'info'
Write-StatusLine -Label "Memory" -Value $sysInfo.Memory -Status 'info'

# === API KEY STATUS ===
$googleKey = Get-APIKeyStatus -Provider 'google'
$geminiKey = Get-APIKeyStatus -Provider 'gemini'
if ($googleKey.Present) {
    Write-StatusLine -Label "Google API" -Value $googleKey.Masked -Status 'ok'
} elseif ($geminiKey.Present) {
    Write-StatusLine -Label "Gemini API" -Value $geminiKey.Masked -Status 'ok'
} else {
    Write-StatusLine -Label "API Key" -Value "Not configured" -Status 'error'
}


# === MCP SERVERS ===
Write-Host ""
Write-Host "  MCP Servers:" -ForegroundColor DarkGray

# Ollama check with auto-start
$ollama = Test-MCPServer -Name 'ollama'

# Auto-start Ollama if not running
if (-not $ollama.Online) {
    $ollamaPath = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
    if (Test-Path $ollamaPath) {
        Write-StatusLine -Label "Ollama" -Value "Starting..." -Status 'warning'
        Start-Process -FilePath $ollamaPath -ArgumentList "serve" -WindowStyle Hidden
        # Wait for Ollama to start (max 5 seconds)
        $retries = 10
        while ($retries -gt 0 -and -not $ollama.Online) {
            Start-Sleep -Milliseconds 500
            $ollama = Test-MCPServer -Name 'ollama'
            $retries--
        }
    }
}

$ollamaSt = if ($ollama.Online) { 'ok' } else { 'error' }
Write-StatusLine -Label "Ollama" -Value $ollama.Message -Status $ollamaSt

$servers = @('serena', 'desktop-commander', 'playwright')
foreach ($srv in $servers) {
    $status = Test-MCPServer -Name $srv
    $st = if ($status.Online) { 'ok' } else { 'error' }
    Write-StatusLine -Label $srv -Value $status.Message -Status $st
}

Write-Host ""
Write-StatusLine -Label "Config" -Value ".gemini/ (local)" -Status 'info'
Write-Separator -Width 55

# === ERROR LOGGER ===
$errorLogModule = 'C:\Users\BIURODOM\Desktop\ClaudeCLI\ai-handler\modules\ErrorLogger.psm1'
if (Test-Path $errorLogModule) {
    Import-Module $errorLogModule -Force -Global -ErrorAction SilentlyContinue
    Initialize-ErrorLogger | Out-Null
}

# === SMART QUEUE ===
$smartQueueModule = 'C:\Users\BIURODOM\Desktop\ClaudeCLI\ai-handler\modules\SmartQueue.psm1'
if (Test-Path $smartQueueModule) {
    Import-Module $smartQueueModule -Force -Global -ErrorAction SilentlyContinue
}

# === AI CODING TOOLS ===
$aiCodingModules = @(
    'AICodeReview.psm1',
    'SemanticGitCommit.psm1',
    'PredictiveAutocomplete.psm1'
)
$loadedTools = @()
foreach ($mod in $aiCodingModules) {
    $modPath = "C:\Users\BIURODOM\Desktop\ClaudeCLI\ai-handler\modules\$mod"
    if (Test-Path $modPath) {
        Import-Module $modPath -Force -Global -ErrorAction SilentlyContinue
        $loadedTools += $mod -replace '\.psm1$', ''
    }
}

# === AI HANDLER ===
Write-Host ""
Write-Host "  AI Handler:" -ForegroundColor DarkGray
$aiHandlerModule = 'C:\Users\BIURODOM\Desktop\ClaudeCLI\ai-handler\AIModelHandler.psm1'
if (Test-Path $aiHandlerModule) {
    try {
        Import-Module $aiHandlerModule -Force -Global -ErrorAction Stop
        Initialize-AIState | Out-Null

        # Check Ollama (already checked above, just show AI Handler status)
        if ($ollama.Online) {
            Write-StatusLine -Label "Ollama (local)" -Value "Ready for AI Handler" -Status 'ok'
        } else {
            Write-StatusLine -Label "Ollama (local)" -Value "Not running" -Status 'warning'
        }

        # Check cloud providers (fallback)
        $hasAnthropic = [bool]$env:ANTHROPIC_API_KEY
        $hasOpenAI = [bool]$env:OPENAI_API_KEY
        $cloudMsg = @()
        if ($hasAnthropic) { $cloudMsg += "Anthropic" }
        if ($hasOpenAI) { $cloudMsg += "OpenAI" }
        if ($cloudMsg.Count -gt 0) {
            Write-StatusLine -Label "Cloud APIs" -Value ($cloudMsg -join ", ") -Status 'ok'
        } else {
            Write-StatusLine -Label "Cloud APIs" -Value "No keys (local only)" -Status 'info'
        }

        Write-StatusLine -Label "AI Handler" -Value "v1.0 loaded (shared)" -Status 'ok'

        # Create global aliases
        Set-Alias -Name ai -Value 'C:\Users\BIURODOM\Desktop\ClaudeCLI\ai-handler\Invoke-AI.ps1' -Scope Global -Force
    } catch {
        Write-StatusLine -Label "AI Handler" -Value "Load failed: $_" -Status 'error'
    }
} else {
    Write-StatusLine -Label "AI Handler" -Value "Module not found" -Status 'warning'
}

# === AI CODING TOOLS STATUS ===
Write-Host ""
Write-Host "  AI Coding Tools:" -ForegroundColor DarkGray
if ($loadedTools.Count -gt 0) {
    Write-StatusLine -Label "Code Review" -Value "Invoke-AICodeReview" -Status 'ok'
    Write-StatusLine -Label "Git Commit" -Value "New-AICommitMessage" -Status 'ok'
    Write-StatusLine -Label "Autocomplete" -Value "Get-CodePrediction" -Status 'ok'
} else {
    Write-StatusLine -Label "AI Tools" -Value "Not loaded" -Status 'warning'
}

Write-Separator -Width 55

# === WELCOME & TIP ===
Show-WelcomeMessage -CLI 'Gemini'
Write-Host ""
Write-Host "  Tip: " -NoNewline -ForegroundColor DarkYellow
Write-Host (Get-TipOfDay) -ForegroundColor DarkGray

Show-QuickCommands -CLI 'gemini'
Write-Host ""
Write-Separator -Width 55


Write-Host ""
Write-Host "  Starting Gemini CLI..." -ForegroundColor Cyan
Write-Host ""

# === START GEMINI ===
try {
    gemini
} catch {
    $errorMsg = $_.Exception.Message
    Write-Host "  ERROR: $errorMsg" -ForegroundColor Red

    # Log error
    if (Get-Command Write-ErrorLog -ErrorAction SilentlyContinue) {
        Write-ErrorLog -Message "Gemini CLI failed" -ErrorRecord $_ -Source 'Launcher'
    }

    Write-Host "  Trying npx @google/gemini-cli..." -ForegroundColor Yellow
    try {
        npx @google/gemini-cli
    } catch {
        if (Get-Command Write-ErrorLog -ErrorAction SilentlyContinue) {
            Write-ErrorLog -Message "Gemini CLI fallback failed" -ErrorRecord $_ -Source 'Launcher'
        }
    }
}

# === SESSION END ===
$sessionDuration = Get-SessionDuration

# Show THE END
Show-TheEnd -Variant 'gemini' -SessionDuration $sessionDuration

# Log session end
if (Get-Command Write-LogEntry -ErrorAction SilentlyContinue) {
    Write-LogEntry -Level 'INFO' -Message "Session ended" -Source 'Launcher' -Data @{
        duration = $sessionDuration
        cli = 'GeminiCLI'
    }
}

Write-Host "  Press any key to close..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
