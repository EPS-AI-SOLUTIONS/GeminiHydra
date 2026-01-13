# ═══════════════════════════════════════════════════════════════════════════════
# GEMINI CLI - CUSTOM PROFILE
# Isolated profile for GeminiCLI (does not load user's default profile)
# ═══════════════════════════════════════════════════════════════════════════════

# === PSReadLine Configuration ===
if (Get-Module -Name PSReadLine -ErrorAction SilentlyContinue) {
    # Double-Escape as interrupt
    $script:lastEscapeTime = [DateTime]::MinValue
    Set-PSReadLineKeyHandler -Key Escape -ScriptBlock {
        $now = [DateTime]::Now
        $diff = ($now - $script:lastEscapeTime).TotalMilliseconds
        if ($diff -lt 400) {
            [Microsoft.PowerShell.PSConsoleReadLine]::CancelLine()
            [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
        } else {
            [Microsoft.PowerShell.PSConsoleReadLine]::RevertLine()
        }
        $script:lastEscapeTime = $now
    }

    # Ctrl+C trap
    Set-PSReadLineKeyHandler -Key Ctrl+c -ScriptBlock {
        $line = $null
        $cursor = $null
        [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)
        if ($line.Length -gt 0) {
            [Microsoft.PowerShell.PSConsoleReadLine]::CancelLine()
        } else {
            Write-Host "`n[Ctrl+C] Use 'exit' to quit or Double-Escape to interrupt" -ForegroundColor Yellow
            [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
        }
    }
}

# === Gemini Function (direct, no wrapper) ===
function Start-Gemini {
    param([Parameter(ValueFromRemainingArguments)]$Arguments)
    
    $key = [System.Environment]::GetEnvironmentVariable('GOOGLE_API_KEY', 'User')
    if (-not $key) {
        $key = [System.Environment]::GetEnvironmentVariable('GEMINI_API_KEY', 'User')
    }
    $env:GOOGLE_API_KEY = $key
    
    $model = if ($key) { "gemini-2.5-pro" } else { "gemini-2.5-flash" }
    
    $geminiPath = (Get-Command gemini -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
    if ($geminiPath) {
        & $geminiPath -m $model @Arguments
    } else {
        npx @google/gemini-cli -m $model @Arguments
    }
}

Set-Alias -Name g -Value Start-Gemini

# === Prompt ===
function prompt {
    $path = (Get-Location).Path
    if ($path.Length -gt 40) { $path = "..." + $path.Substring($path.Length - 37) }
    Write-Host "[" -NoNewline -ForegroundColor DarkGray
    Write-Host "Gemini" -NoNewline -ForegroundColor Cyan
    Write-Host "] " -NoNewline -ForegroundColor DarkGray
    Write-Host $path -NoNewline -ForegroundColor Blue
    return " > "
}

Write-Host "[GeminiCLI Profile Loaded]" -ForegroundColor DarkGray
