# GeminiExtras.psm1 - Utility Module for GeminiHydra
# Contains "Quality of Life" improvements and extra tools.

function Show-SystemInfo {
    <#
    .SYNOPSIS
        Displays system information relevant for AI tasks.
    #>
    $os = Get-CimInstance Win32_OperatingSystem
    $comp = Get-CimInstance Win32_ComputerSystem
    $proc = Get-CimInstance Win32_Processor | Select-Object -First 1

    $memTotal = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
    $memFree = [math]::Round($os.FreePhysicalMemory / 1MB, 2)

    Write-Host "`n--- SYSTEM STATUS ---" -ForegroundColor Cyan
    Write-Host "OS: $($os.Caption) ($($os.OSArchitecture))"
    Write-Host "CPU: $($proc.Name)"
    Write-Host "RAM: ${memFree}GB Free / ${memTotal}GB Total"
    Write-Host "User: $($env:USERNAME)"
    Write-Host "---------------------`n"
}

function Get-GeminiPrompt {
    <#
    .SYNOPSIS
        Retrieves a prompt template from data/prompts.
    #>
    param(
        [string]$Name
    )
    $PromptPath = "$PSScriptRoot\data\prompts\$Name.txt"
    if (Test-Path $PromptPath) {
        Get-Content $PromptPath -Raw
    } else {
        Write-Warning "Prompt not found: $Name"
    }
}

function z {
    <#
    .SYNOPSIS
        Quick navigation alias (Z-Location lite).
    #>
    param(
        [string]$Path
    )
    if (-not $Path) {
        Write-Host "Usage: z <path>" -ForegroundColor Yellow
        return
    }
    
    # Check if path exists directly
    if (Test-Path $Path) {
        Set-Location $Path
    } 
    # Check if it is a known project subdirectory
    elseif (Test-Path "$PSScriptRoot\$Path") {
        Set-Location "$PSScriptRoot\$Path"
    }
    elseif (Test-Path "$PSScriptRoot\GeminiGUI\$Path") {
        Set-Location "$PSScriptRoot\GeminiGUI\$Path"
    }
    else {
        Write-Warning "Path not found: $Path"
    }
}

function Show-LLMStats {
    <#
    .SYNOPSIS
        Estimates token usage based on session logs.
    #>
    $logPath = "$PSScriptRoot\agent_swarm.log"
    $tokens = 0
    if (Test-Path $logPath) {
        # Rough estimation: 1 token ~= 4 chars
        $info = Get-Item $logPath
        $tokens = [math]::Round($info.Length / 4)
    }
    
    Write-Host "`n[LLM DASHBOARD]" -ForegroundColor Magenta
    Write-Host "Est. Log Volume:     $tokens tokens"
    Write-Host "Cost (Local):        $0.00 (Ollama is free)"
    Write-Host "Gemini Flash Equiv:  `$$([math]::Round($tokens * 0.0000001, 5))"
}

function Load-EnvFile {
    <#
    .SYNOPSIS
        Loads variables from a .env file into the current session.
    #>
    param(
        [string]$Path = "$PSScriptRoot\.env"
    )
    if (Test-Path $Path) {
        Get-Content $Path | ForEach-Object {
            if ($_ -match '^([^#=]+)=(.*)$') {
                $name = $matches[1].Trim()
                $value = $matches[2].Trim()
                [Environment]::SetEnvironmentVariable($name, $value, "Process")
                Write-Verbose "Loaded Env: $name"
            }
        }
        Write-Host "Environment variables loaded from $Path" -ForegroundColor Green
    } else {
        Write-Warning ".env file not found at $Path"
    }
}

function Archive-Logs {
    <#
    .SYNOPSIS
        Compresses logs older than 7 days.
    #>
    param(
        [string]$LogDir = "$PSScriptRoot\.gemini\logs",
        [int]$Days = 7
    )
    if (-not (Test-Path $LogDir)) { Write-Warning "Log dir not found"; return }
    
    $OldLogs = Get-ChildItem -Path $LogDir -Filter "*.log" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$Days) }
    
    if ($OldLogs) {
        $ArchiveName = "$LogDir\archive_$(Get-Date -Format 'yyyyMMdd').zip"
        Compress-Archive -Path $OldLogs.FullName -DestinationPath $ArchiveName -Update
        $OldLogs | Remove-Item
        Write-Host "Archived $($OldLogs.Count) logs to $ArchiveName" -ForegroundColor Green
    } else {
        Write-Host "No logs older than $Days days to archive." -ForegroundColor Gray
    }
}

function Get-OllamaStatus {
    <#
    .SYNOPSIS
        Parses 'ollama list' output into objects.
    #>
    try {
        $raw = ollama list
        if ($raw) {
            # Skip header, simple parsing assuming standard output format
            $raw | Select-Object -Skip 1 | ForEach-Object {
                $parts = $_ -split '\s{2,}' # Split by 2 or more spaces
                if ($parts.Count -ge 3) {
                    [PSCustomObject]@{
                        Model = $parts[0]
                        ID = $parts[1]
                        Size = $parts[2]
                        Modified = $parts[3]
                    }
                }
            }
        }
    } catch {
        Write-Error "Ollama is not running or not installed."
    }
}

function New-AiCommit {
    <#
    .SYNOPSIS
        Generates a commit message using local AI (Ollama).
    #>
    param([switch]$Push)
    
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Error "Git not found."; return }
    
    $diff = git diff --staged
    if (-not $diff) {
        Write-Warning "No staged changes. Run 'git add' first."
        return
    }

    # Limit diff size to prevent context overflow (approx 4k chars)
    $diffContext = if ($diff.Length -gt 4000) { $diff.Substring(0, 4000) + "...(truncated)" } else { $diff }
    
    Write-Host "Analyzing changes with Ollama (qwen2.5-coder:1.5b)..." -ForegroundColor Cyan
    
    # Try using qwen, fallback to what's available
    $model = "qwen2.5-coder:1.5b"
    
    # Simple prompt
    $prompt = "Generate a concise git commit message (Conventional Commits style) for this diff. Output ONLY the message text. Diff: $diffContext"
    
    try {
        $msg = ollama run $model $prompt
        
        if (-not $msg) { throw "Empty response from Ollama" }
        
        Write-Host "`nProposed Commit Message:" -ForegroundColor Green
        Write-Host "------------------------------------------------"
        Write-Host $msg -ForegroundColor White
        Write-Host "------------------------------------------------"
        
        $choice = Read-Host "Commit with this message? (y/n/edit)"
        if ($choice -eq 'y') {
            git commit -m "$msg"
            if ($Push) { git push }
        } elseif ($choice -eq 'edit') {
            $newMsg = Read-Host "Enter new message"
            git commit -m "$newMsg"
        }
    } catch {
        Write-Error "AI Generation failed: $_"
    }
}

function Compress-Context {
    <#
    .SYNOPSIS
        Minifies code to save tokens (Aggressive).
    #>
    param([string]$Path)
    
    if (-not (Test-Path $Path)) { return "" }
    
    $ext = [System.IO.Path]::GetExtension($Path).ToLower()
    $content = Get-Content $Path -Raw
    
    if ($ext -in @('.js', '.ts', '.tsx', '.json', '.css')) {
        # JS/TS/JSON: Remove // comments and /* */ comments
        $content = $content -replace '//.*', ''
        $content = $content -replace '(?s)/\*.*?\*/', ''
    } elseif ($ext -in @('.ps1', '.psm1', '.py')) {
        # PowerShell/Python: Remove # comments
        $content = $content -replace '(?m)#.*$', ''
    }
    
    # Remove empty lines and excess whitespace
    $content = $content -replace '(?m)^\s*[\r\n]+', ''
    $content = $content -replace '\s{2,}', ' '
    
    return $content.Trim()
}

Export-ModuleMember -Function Show-SystemInfo, z, Show-LLMStats, Get-GeminiPrompt, Load-EnvFile, Archive-Logs, Get-OllamaStatus, New-AiCommit, Compress-Context