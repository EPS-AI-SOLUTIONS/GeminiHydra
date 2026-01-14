# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# GEMINI CLI WRAPPER WITH FALLBACK - HYDRA v2.0
# Przechwytuje bĹ‚Ä™dy 429/quota i automatycznie przeĹ‚Ä…cza na fallback providera
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# FALLBACK CHAIN CONFIGURATION
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

$script:FallbackProviders = @(
    @{
        Name = "gemini"
        Type = "cli"
        Command = "gemini"
        Available = { Get-Command "gemini" -ErrorAction SilentlyContinue }
        ErrorPatterns = @('429', 'quota', 'RESOURCE_EXHAUSTED', 'rate.?limit', 'too many requests')
    },
    @{
        Name = "ollama"
        Type = "api"
        Model = "llama3.2:3b"
        Available = {
            try {
                $null = Invoke-WebRequest -Uri "http://localhost:11434" -Method Head -TimeoutSec 1 -ErrorAction Stop
                $true
            } catch { $false }
        }
        Invoke = {
            param($prompt)
            $body = @{
                model = "llama3.2:3b"
                prompt = $prompt
                stream = $false
            } | ConvertTo-Json
            $response = Invoke-RestMethod -Uri "http://localhost:11434/api/generate" -Method Post -Body $body -ContentType "application/json"
            return $response.response
        }
    },
    @{
        Name = "anthropic"
        Type = "api"
        Model = "claude-3-5-haiku-latest"
        Available = { $null -ne $env:ANTHROPIC_API_KEY }
        Invoke = {
            param($prompt)
            $messages = @(@{ role = "user"; content = $prompt })
            $result = Invoke-AIRequest -Messages $messages -Provider "anthropic" -Model "claude-3-5-haiku-latest" -MaxTokens 4096
            if ($result.content) { return $result.content[0].text }
            return $result
        }
    },
    @{
        Name = "openai"
        Type = "api"
        Model = "gpt-4o-mini"
        Available = { $null -ne $env:OPENAI_API_KEY }
        Invoke = {
            param($prompt)
            $messages = @(@{ role = "user"; content = $prompt })
            $result = Invoke-AIRequest -Messages $messages -Provider "openai" -Model "gpt-4o-mini" -MaxTokens 4096
            if ($result.choices) { return $result.choices[0].message.content }
            return $result
        }
    }
)

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# ERROR DETECTION
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# GEMINI CLI WRAPPER WITH ERROR CAPTURE
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function Invoke-GeminiCLI {
    param(
        [switch]$Interactive,
        [int]$MaxRetries = 3,
        [int]$RetryDelayMs = 2000
    )

    $attempt = 0
    $lastError = $null

    while ($attempt -lt $MaxRetries) {
        $attempt++

        Write-Host "[HYDRA] Gemini CLI - Attempt $attempt/$MaxRetries" -ForegroundColor Cyan

        # Create temp file to capture stderr
        $errorFile = [System.IO.Path]::GetTempFileName()

        try {
            if ($Interactive) {
                # Run Gemini interactively, capture stderr
                $process = Start-Process -FilePath "node" -ArgumentList "src/server.js" -NoNewWindow -PassThru -Wait `
                    -RedirectStandardError $errorFile

                $exitCode = $process.ExitCode
                $errorOutput = if (Test-Path $errorFile) { Get-Content $errorFile -Raw } else { "" }
            } else {
                # Non-interactive: just run and capture
                if (Test-Path "src/server.js") { $errorOutput = node src/server.js 2>&1 | Out-String } else { $errorOutput = & gemini 2>&1 | Out-String }
                $exitCode = $LASTEXITCODE
            }

            # Check for quota errors
            if (Test-QuotaError -Output $errorOutput) {
                $lastError = $errorOutput
                Write-Host "[HYDRA] Quota error detected (429)" -ForegroundColor Yellow

                # Calculate exponential backoff
                $delay = $RetryDelayMs * [Math]::Pow(2, $attempt - 1)
                $delay = [Math]::Min($delay, 60000)  # Max 60 seconds

                if ($attempt -lt $MaxRetries) {
                    Write-Host "[HYDRA] Waiting $([int]($delay/1000))s before retry..." -ForegroundColor DarkGray
                    Start-Sleep -Milliseconds $delay
                }
                continue
            }

            # Success or non-quota error
            if ($exitCode -eq 0) {
                return @{ Success = $true; Output = $null }
            }

        } catch {
            $lastError = $_.Exception.Message
            Write-Host "[HYDRA] Error: $lastError" -ForegroundColor Red
        } finally {
            if (Test-Path $errorFile) { Remove-Item $errorFile -Force -ErrorAction SilentlyContinue }
        }
    }

    # All retries exhausted
    return @{
        Success = $false
        Error = $lastError
        NeedsFallback = (Test-QuotaError -Output $lastError)
    }
}

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# FALLBACK EXECUTION
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function Invoke-FallbackProvider {
    param(
        [string]$Prompt,
        [string]$SkipProvider = "gemini"
    )

    $fallbacks = Get-AvailableFallbacks | Where-Object { $_.Name -ne $SkipProvider }

    if ($fallbacks.Count -eq 0) {
        Write-Host "[HYDRA] No fallback providers available!" -ForegroundColor Red
        return $null
    }

    foreach ($provider in $fallbacks) {
        Write-Host "[HYDRA] Trying fallback: $($provider.Name)/$($provider.Model)" -ForegroundColor Yellow

        try {
            if ($provider.Type -eq "api" -and $provider.Invoke) {
                $result = & $provider.Invoke $Prompt
                if ($result) {
                    Write-Host "[HYDRA] Fallback SUCCESS with $($provider.Name)" -ForegroundColor Green
                    return @{
                        Provider = $provider.Name
                        Model = $provider.Model
                        Response = $result
                    }
                }
            }
        } catch {
            Write-Host "[HYDRA] Fallback $($provider.Name) failed: $($_.Exception.Message)" -ForegroundColor Red
            continue
        }
    }

    return $null
}

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# INTERACTIVE SESSION WITH FALLBACK
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function Start-GeminiWithFallback {
    param(
        [int]$MaxRetries = 3,
        [int]$RetryDelayMs = 2000
    )

    Write-Host ""
    Write-Host "  [HYDRA FALLBACK WRAPPER]" -ForegroundColor Cyan
    Write-Host "  Primary: Gemini CLI" -ForegroundColor Gray

    # Show available fallbacks
    $fallbacks = Get-AvailableFallbacks | Where-Object { $_.Name -ne "gemini" }
    if ($fallbacks.Count -gt 0) {
        $fallbackNames = ($fallbacks | ForEach-Object { "$($_.Name)/$($_.Model)" }) -join " -> "
        Write-Host "  Fallback: $fallbackNames" -ForegroundColor DarkGray
    } else {
        Write-Host "  Fallback: [NONE AVAILABLE]" -ForegroundColor Red
    }
    Write-Host ""

    # Try Gemini CLI first
    $result = Invoke-GeminiCLI -Interactive -MaxRetries $MaxRetries -RetryDelayMs $RetryDelayMs

    if ($result.Success) {
        return
    }

    if ($result.NeedsFallback) {
        Write-Host ""
        Write-Host "[HYDRA] Gemini quota exhausted. Activating fallback mode..." -ForegroundColor Yellow
        Write-Host ""

        # Enter fallback interactive mode
        Write-Host "  [FALLBACK MODE ACTIVE]" -ForegroundColor Magenta
        Write-Host "  Type your prompts below. Type 'exit' to quit." -ForegroundColor Gray
        Write-Host ""

        while ($true) {
            Write-Host "YOU> " -NoNewline -ForegroundColor Green
            $userInput = Read-Host

            if ($userInput -eq "exit" -or $userInput -eq "quit") {
                Write-Host "[HYDRA] Fallback session ended." -ForegroundColor Cyan
                break
            }

            if ([string]::IsNullOrWhiteSpace($userInput)) {
                continue
            }

            $response = Invoke-FallbackProvider -Prompt $userInput

            if ($response) {
                Write-Host ""
                Write-Host "[$($response.Provider.ToUpper())]> " -NoNewline -ForegroundColor Cyan
                Write-Host $response.Response -ForegroundColor White
                Write-Host ""
            } else {
                Write-Host "[ERROR] All providers failed. Please try again later." -ForegroundColor Red
            }
        }
    } else {
        Write-Host "[HYDRA] Gemini CLI exited with non-quota error." -ForegroundColor Red
        Write-Host "Error: $($result.Error)" -ForegroundColor DarkRed
    }
}

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# MAIN EXECUTION
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

if ($Interactive -or -not $Prompt) {
    Start-GeminiWithFallback -MaxRetries $MaxRetries -RetryDelayMs $RetryDelayMs
} else {
    # Single prompt mode
    $response = Invoke-FallbackProvider -Prompt $Prompt -SkipProvider ""
    if ($response) {
        Write-Output $response.Response
    }
}

