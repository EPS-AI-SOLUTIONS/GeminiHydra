<#
.SYNOPSIS
    Quick AI invocation with automatic fallback and smart classification
.DESCRIPTION
    Wrapper for the AI Model Handler with intelligent task classification.
    Uses premium AI (Claude Opus / GPT-4o) to classify tasks and route
    them to the optimal execution model.
.EXAMPLE
    .\Invoke-AI.ps1 -Prompt "Explain quantum computing"
.EXAMPLE
    .\Invoke-AI.ps1 -Prompt "Write a Python function" -Smart
.EXAMPLE
    .\Invoke-AI.ps1 -Prompt "Complex architecture question" -Smart -Verbose
.EXAMPLE
    .\Invoke-AI.ps1 -Status
#>

[CmdletBinding(DefaultParameterSetName = 'Query')]
param(
    [Parameter(ParameterSetName = 'Query', Position = 0)]
    [string]$Prompt,

    [Parameter(ParameterSetName = 'Query')]
    [string]$SystemPrompt,

    [Parameter(ParameterSetName = 'Query')]
    [string]$Provider,

    [Parameter(ParameterSetName = 'Query')]
    [string]$Model,

    [Parameter(ParameterSetName = 'Query')]
    [int]$MaxTokens = 4096,

    [Parameter(ParameterSetName = 'Query')]
    [float]$Temperature = 0.7,

    [Parameter(ParameterSetName = 'Query')]
    [switch]$NoFallback,

    [Parameter(ParameterSetName = 'Query')]
    [switch]$Stream,

    [Parameter(ParameterSetName = 'Query')]
    [switch]$Swarm,

    [Parameter(ParameterSetName = 'Status')]
    [switch]$Status,

    [Parameter(ParameterSetName = 'Test')]
    [switch]$Test,

    [Parameter(ParameterSetName = 'Reset')]
    [switch]$Reset
)

$ErrorActionPreference = "Stop"
$ModulePath = Join-Path $PSScriptRoot "AIModelHandler.psm1"

# Import module
Import-Module $ModulePath -Force

# Handle different modes
switch ($PSCmdlet.ParameterSetName) {
    'Status' {
        Get-AIStatus
        return
    }

    'Test' {
        Test-AIProviders
        return
    }

    'Reset' {
        Reset-AIState -Force
        return
    }

    'Query' {
        if (-not $Prompt) {
            Write-Host "Usage: .\Invoke-AI.ps1 -Prompt 'Your question here'" -ForegroundColor Yellow
            Write-Host "`nOptions:" -ForegroundColor Cyan
            Write-Host "  -Swarm            : Use the Agent Swarm protocol for complex queries" -ForegroundColor Green
            Write-Host "  -SystemPrompt     : Custom system prompt"
            Write-Host "  -Provider         : Force specific provider"
            Write-Host "  -Model            : Force specific model"
            Write-Host "  -NoFallback       : Disable automatic fallback"
            Write-Host "  -Status           : Show current status"
            Write-Host "  -Test             : Test all providers"
            Write-Host "  -Reset            : Reset usage data"
            return
        }

        # Build messages
        $messages = @()
        if ($SystemPrompt) {
            $messages += @{ role = "system"; content = $SystemPrompt }
        }
        $messages += @{ role = "user"; content = $Prompt }

        try {
            Write-Host "`nExecuting request..." -ForegroundColor Cyan
            
            $config = Get-AIConfig
            $streamEnabled = $Stream -or ($config.settings.streamResponses -eq $true)

            # Check if Swarm should be used by default
            $useSwarm = $Swarm.IsPresent
            if (-not $useSwarm -and $config.settings.useSwarmByDefault) {
                # Only default to swarm if no specific provider/model overrides are set that might conflict
                if (-not $Provider -and -not $Model) {
                     $useSwarm = $true
                     Write-Verbose "Using Swarm by default as per configuration"
                }
            }

            $invokeParams = @{
                Messages    = $messages
                MaxTokens   = $MaxTokens
                Temperature = $Temperature
                AutoFallback = -not $NoFallback
                Stream      = $streamEnabled
                Swarm       = $useSwarm
            }
            if ($Provider) { $invokeParams.Provider = $Provider }
            if ($Model) { $invokeParams.Model = $Model }

            $response = Invoke-AIRequest @invokeParams

            # Output response
            Write-Host "`n" + ("=" * 60) -ForegroundColor Green
            Write-Host " RESPONSE" -ForegroundColor Green
            Write-Host ("=" * 60) -ForegroundColor Green
            if (-not $streamEnabled) {
                Write-Host $response.content
            }

            # Show metadata
            if ($response._meta) {
                Write-Host "`n" + ("-" * 40) -ForegroundColor Gray
                Write-Host "Provider: $($response._meta.provider) | Model: $($response._meta.model)" -ForegroundColor Gray
                if ($response.usage) {
                    Write-Host "Tokens: $($response.usage.input_tokens) in / $($response.usage.output_tokens) out" -ForegroundColor Gray
                }
            }
        } catch {
            Write-Host "`nError: $($_.Exception.Message)" -ForegroundColor Red
            exit 1
        }
    }
}
