# ═══════════════════════════════════════════════════════════════════════════
# GEMINI CLI WRAPPER WITH FALLBACK - HYDRA v2.0
# Przechwytuje błędy 429/quota i automatycznie przełącza na fallback providera
# ═══════════════════════════════════════════════════════════════════════════

param(
    [string]$Prompt,
    [switch]$Interactive,
    [int]$MaxRetries = 3,
    [int]$RetryDelayMs = 2000
)

$script:ProjectRoot = if ($PSScriptRoot) { $PSScriptRoot } else { $PWD.Path }

# Import AI Handler modules
$aiHandlerModule = Join-Path $script:ProjectRoot 'ai-handler\AIModelHandler.psm1'
$aiErrorHandler = Join-Path $script:ProjectRoot 'ai-handler\utils\AIErrorHandler.psm1'

if (Test-Path $aiHandlerModule) { Import-Module $aiHandlerModule -Force -ErrorAction SilentlyContinue }
if (Test-Path $aiErrorHandler) { Import-Module $aiErrorHandler -Force -ErrorAction SilentlyContinue }

# ═══════════════════════════════════════════════════════════════════════════
# FALLBACK CHAIN CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

$script:FallbackProviders = @(
    @{
        Name          = "gemini"
        Type          = "cli"
        Command       = "gemini"
        Available     = { Get-Command "gemini" -ErrorAction SilentlyContinue }
        ErrorPatterns = @('429', 'quota', 'RESOURCE_EXHAUSTED', 'rate.?limit', 'too many requests')
    },
    @{
        Name      = "ollama"
        Type      = "api"
        Model     = "llama3.2:3b"
        Available = {
            try {
                $null = Invoke-WebRequest -Uri "http://localhost:11434" -Method Head -TimeoutSec 1 -ErrorAction Stop
                $true
            }
            catch { $false }
        }
        Invoke    = {
            param($prompt)
            $body = @{
                model  = "llama3.2:3b"
                prompt = $prompt
                stream = $false
            } | ConvertTo-Json
            $response = Invoke-RestMethod -Uri "http://localhost:11434/api/generate" -Method Post -Body $body -ContentType "application/json"
            return $response.response
        }
    },
    @{
        Name      = "anthropic"
        Type      = "api"
        Model     = "claude-3-5-haiku-latest"
        Available = { $null -ne $env:ANTHROPIC_API_KEY }
        Invoke    = {
            param($prompt)
            $messages = @(@{ role = "user"; content = $prompt })
            $result = Invoke-AIRequest -Messages $messages -Provider "anthropic" -Model "claude-3-5-haiku-latest" -MaxTokens 4096
            if ($result.content) { return $result.content[0].text }
            return $result
        }
    },
    @{
        Name      = "openai"
        Type      = "api"
        Model     = "gpt-4o-mini"
        Available = { $null -ne $env:OPENAI_API_KEY }
        Invoke    = {
            param($prompt)
            $messages = @(@{ role = "user"; content = $prompt })
            $result = Invoke-AIRequest -Messages $messages -Provider "openai" -Model "gpt-4o-mini" -MaxTokens 4096
            if ($result.choices) { return $result.choices[0].message.content }
            return $result
        }
    }
)

# ═══════════════════════════════════════════════════════════════════════════
# ERROR DETECTION
# ═══════════════════════════════════════════════════════════════════════════

function Test-QuotaError {
    param([string]$Output)

    $quotaPatterns = @(
        '429',
        'quota',
        'RESOURCE_EXHAUSTED',
        'rate.?limit',
        'too many requests',
        'Resource has been exhausted'
    )

    foreach ($pattern in $quotaPatterns) {
        if ($Output -match $pattern) {
            return $true
        }
    }
    return $false
}

function Get-AvailableFallbacks {
    $available = @()
    foreach ($provider in $script:FallbackProviders) {
        $isAvailable = & $provider.Available
        if ($isAvailable) {
            $available += $provider
        }
    }
    return $available
}

function Invoke-ProviderOnce {
    param(
        [hashtable]$Provider,
        [string]$Prompt
    )

    if ($Provider.Type -eq "cli") {
        $output = & $Provider.Command $Prompt 2>&1
        $text = ($output | Out-String).Trim()
        if ($LASTEXITCODE -ne 0) {
            throw $text
        }
        if (Test-QuotaError -Output $text) {
            throw $text
        }
        if ([string]::IsNullOrWhiteSpace($text)) {
            throw "Empty response from $($Provider.Name)"
        }
        return $text
    }

    $response = & $Provider.Invoke $Prompt
    if ([string]::IsNullOrWhiteSpace($response)) {
        throw "Empty response from $($Provider.Name)"
    }
    return $response
}

function Invoke-ProviderWithRetries {
    param(
        [hashtable]$Provider,
        [string]$Prompt
    )

    $lastError = $null
    for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
        try {
            $response = Invoke-ProviderOnce -Provider $Provider -Prompt $Prompt
            return @{
                Success = $true
                Provider = $Provider.Name
                Response = $response
            }
        } catch {
            $lastError = $_.Exception.Message
            $isQuota = Test-QuotaError -Output $lastError
            if ($isQuota) {
                return @{
                    Success = $false
                    Provider = $Provider.Name
                    Error = $lastError
                    Quota = $true
                }
            }
            if ($attempt -lt $MaxRetries) {
                Start-Sleep -Milliseconds $RetryDelayMs
            }
        }
    }

    return @{
        Success = $false
        Provider = $Provider.Name
        Error = $lastError
        Quota = $false
    }
}

function Invoke-WithFallback {
    param(
        [Parameter(Mandatory)]
        [string]$Prompt
    )

    $available = Get-AvailableFallbacks
    if (-not $available -or $available.Count -eq 0) {
        throw "No available providers."
    }

    $errors = @()
    foreach ($provider in $available) {
        $result = Invoke-ProviderWithRetries -Provider $provider -Prompt $Prompt
        if ($result.Success) {
            return @{
                Provider = $result.Provider
                Response = $result.Response
            }
        }

        $errors += "$($result.Provider): $($result.Error)"
    }

    throw ("All providers failed. " + ($errors -join " | "))
}

function Start-InteractiveLoop {
    Write-Host "HYDRA fallback shell. Type 'exit' to quit." -ForegroundColor DarkGray
    while ($true) {
        $inputPrompt = Read-Host "You"
        if ($null -eq $inputPrompt) { continue }
        $trimmed = $inputPrompt.Trim()
        if ($trimmed.Length -eq 0) { continue }
        if ($trimmed -in @("exit", "quit", "q")) { break }

        try {
            $result = Invoke-WithFallback -Prompt $trimmed
            Write-Host ""
            Write-Host $result.Response
            Write-Host ""
        } catch {
            Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

if ($Interactive) {
    Start-InteractiveLoop
    return
}

if (-not $Prompt) {
    Write-Host "Usage: .\\Invoke-GeminiWithFallback.ps1 -Prompt 'Your question' [-Interactive]" -ForegroundColor Yellow
    exit 1
}

try {
    $result = Invoke-WithFallback -Prompt $Prompt
    Write-Host $result.Response
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
