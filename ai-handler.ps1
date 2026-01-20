# AI Handler - Lokalna integracja z Ollama
# Uzycie: .\ai-handler.ps1 <komenda> [argumenty]

param(
    [Parameter(Position=0)]
    [ValidateSet("query", "batch", "pull", "list", "status", "config", "help")]
    [string]$Command = "help",

    [Parameter(Position=1, ValueFromRemainingArguments=$true)]
    [string[]]$Arguments
)

$OllamaHost = "http://127.0.0.1:11434"
$DefaultModel = "qwen2.5-coder:1.5b"
$ConfigFile = "$PSScriptRoot\config\ai-handler-config.json"

function Get-Config {
    if (Test-Path $ConfigFile) {
        return Get-Content $ConfigFile | ConvertFrom-Json
    }
    return @{
        defaultModel = $DefaultModel
        parallelRequests = 3
        timeout = 120
    }
}

function Save-Config($config) {
    $configDir = Split-Path $ConfigFile -Parent
    if (-not (Test-Path $configDir)) {
        New-Item -ItemType Directory -Path $configDir -Force | Out-Null
    }
    $config | ConvertTo-Json | Set-Content $ConfigFile
}

function Get-OllamaStatus {
    try {
        $response = Invoke-RestMethod -Uri "$OllamaHost/api/tags" -Method GET -TimeoutSec 5
        return @{
            running = $true
            models = $response.models
        }
    } catch {
        return @{
            running = $false
            error = $_.Exception.Message
        }
    }
}

function Invoke-OllamaQuery {
    param(
        [string]$Prompt,
        [string]$Model = $DefaultModel,
        [bool]$Stream = $false
    )

    $body = @{
        model = $Model
        prompt = $Prompt
        stream = $Stream
    } | ConvertTo-Json -Depth 3

    try {
        $response = Invoke-RestMethod -Uri "$OllamaHost/api/generate" -Method POST -Body $body -ContentType "application/json; charset=utf-8" -TimeoutSec 120
        return $response.response
    } catch {
        Write-Error "Error: $($_.Exception.Message)"
        return $null
    }
}

function Invoke-BatchQuery {
    param(
        [string[]]$Prompts,
        [string]$Model = $DefaultModel,
        [int]$Parallel = 3
    )

    $jobs = @()
    $results = @()

    foreach ($prompt in $Prompts) {
        $jobs += Start-Job -ScriptBlock {
            param($hostUrl, $model, $prompt)
            $body = @{
                model = $model
                prompt = $prompt
                stream = $false
            } | ConvertTo-Json -Depth 3

            try {
                $response = Invoke-RestMethod -Uri "$hostUrl/api/generate" -Method POST -Body $body -ContentType "application/json; charset=utf-8" -TimeoutSec 120
                return @{
                    prompt = $prompt
                    response = $response.response
                    success = $true
                }
            } catch {
                return @{
                    prompt = $prompt
                    error = $_.Exception.Message
                    success = $false
                }
            }
        } -ArgumentList $OllamaHost, $Model, $prompt

        if ($jobs.Count -ge $Parallel) {
            $completed = $jobs | Wait-Job -Any
            $results += Receive-Job $completed
            $jobs = $jobs | Where-Object { $_.Id -ne $completed.Id }
            Remove-Job $completed
        }
    }

    if ($jobs.Count -gt 0) {
        $jobs | Wait-Job | ForEach-Object {
            $results += Receive-Job $_
            Remove-Job $_
        }
    }

    return $results
}

function Pull-Model {
    param([string]$Model)

    Write-Host "Downloading model: $Model" -ForegroundColor Cyan
    $body = @{ name = $Model } | ConvertTo-Json

    try {
        & curl -X POST "$OllamaHost/api/pull" -d $body -H "Content-Type: application/json"
        Write-Host "`nModel downloaded!" -ForegroundColor Green
    } catch {
        Write-Error "Error: $($_.Exception.Message)"
    }
}

switch ($Command) {
    "query" {
        if ($Arguments.Count -eq 0) {
            Write-Host "Usage: ai-handler.ps1 query <prompt> [model]" -ForegroundColor Yellow
            exit 1
        }
        $prompt = $Arguments[0]
        $model = if ($Arguments.Count -gt 1) { $Arguments[1] } else { $DefaultModel }

        Write-Host "Model: $model" -ForegroundColor Cyan
        Write-Host "---" -ForegroundColor DarkGray
        $result = Invoke-OllamaQuery -Prompt $prompt -Model $model
        Write-Host $result
    }

    "batch" {
        if ($Arguments.Count -eq 0) {
            Write-Host "Usage: ai-handler.ps1 batch <prompts-file.txt>" -ForegroundColor Yellow
            exit 1
        }
        $file = $Arguments[0]
        if (-not (Test-Path $file)) {
            Write-Error "File not found: $file"
            exit 1
        }

        $prompts = Get-Content $file
        Write-Host "Processing $($prompts.Count) queries in parallel..." -ForegroundColor Cyan
        $results = Invoke-BatchQuery -Prompts $prompts

        foreach ($r in $results) {
            $shortPrompt = $r.prompt.Substring(0, [Math]::Min(50, $r.prompt.Length))
            Write-Host "`n--- Prompt: $shortPrompt..." -ForegroundColor Yellow
            if ($r.success) {
                Write-Host $r.response
            } else {
                Write-Host "Error: $($r.error)" -ForegroundColor Red
            }
        }
    }

    "pull" {
        if ($Arguments.Count -eq 0) {
            Write-Host "Usage: ai-handler.ps1 pull <model-name>" -ForegroundColor Yellow
            Write-Host "Examples: llama3.2:1b, qwen2.5-coder:7b, phi3:mini" -ForegroundColor Gray
            exit 1
        }
        Pull-Model -Model $Arguments[0]
    }

    "list" {
        $status = Get-OllamaStatus
        if ($status.running) {
            Write-Host "Available Ollama models:" -ForegroundColor Green
            foreach ($model in $status.models) {
                $sizeGB = [math]::Round($model.size / 1GB, 2)
                Write-Host "  - $($model.name) - $sizeGB GB" -ForegroundColor Cyan
            }
        } else {
            Write-Host "Ollama is not running!" -ForegroundColor Red
            Write-Host "Start with: ollama serve" -ForegroundColor Yellow
        }
    }

    "status" {
        $status = Get-OllamaStatus
        Write-Host "=== AI Providers Status ===" -ForegroundColor Cyan

        if ($status.running) {
            Write-Host "[OK] Ollama: ONLINE" -ForegroundColor Green
            Write-Host "    Host: $OllamaHost"
            Write-Host "    Models: $($status.models.Count)"
        } else {
            Write-Host "[X] Ollama: OFFLINE" -ForegroundColor Red
            Write-Host "    $($status.error)"
        }

        Write-Host ""
        Write-Host "=== Configuration ===" -ForegroundColor Cyan
        $config = Get-Config
        Write-Host "    Default model: $($config.defaultModel)"
        Write-Host "    Parallel requests: $($config.parallelRequests)"
    }

    "config" {
        if ($Arguments.Count -lt 2) {
            Write-Host "Usage: ai-handler.ps1 config <key> <value>" -ForegroundColor Yellow
            Write-Host "Keys: defaultModel, parallelRequests, timeout" -ForegroundColor Gray
            exit 1
        }

        $config = Get-Config
        $key = $Arguments[0]
        $value = $Arguments[1]

        switch ($key) {
            "defaultModel" { $config.defaultModel = $value }
            "parallelRequests" { $config.parallelRequests = [int]$value }
            "timeout" { $config.timeout = [int]$value }
            default { Write-Error "Unknown key: $key"; exit 1 }
        }

        Save-Config $config
        Write-Host "Saved: $key = $value" -ForegroundColor Green
    }

    "help" {
        Write-Host "=== AI Handler - Local Ollama Integration ===" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Commands:"
        Write-Host "  query <prompt> [model]     - Single AI query"
        Write-Host "  batch <file.txt>           - Process multiple prompts in parallel"
        Write-Host "  pull <model>               - Download new model"
        Write-Host "  list                       - List available models"
        Write-Host "  status                     - Check AI providers status"
        Write-Host "  config <key> <value>       - Change configuration"
        Write-Host "  help                       - This help"
        Write-Host ""
        Write-Host "Examples:"
        Write-Host "  .\ai-handler.ps1 query `"Write a sorting function`" qwen2.5-coder:1.5b"
        Write-Host "  .\ai-handler.ps1 batch prompts.txt"
        Write-Host "  .\ai-handler.ps1 pull llama3.2:3b"
        Write-Host "  .\ai-handler.ps1 status"
        Write-Host ""
        Write-Host "Installed Ollama models:" -ForegroundColor Yellow

        $status = Get-OllamaStatus
        if ($status.running) {
            foreach ($model in $status.models) {
                Write-Host "  - $($model.name)" -ForegroundColor Cyan
            }
        } else {
            Write-Host "  (Ollama offline)" -ForegroundColor Red
        }
    }
}
