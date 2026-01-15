#Requires -Version 5.1
<#
.SYNOPSIS
    AI Model Handler with Auto Fallback, Rate Limiting, Cost Optimization & Multi-Provider Support
.DESCRIPTION
    Comprehensive AI model management system for GeminiCLI featuring:
    - Auto-retry with model downgrade (Opus → Sonnet → Haiku)
    - Rate limit aware switching
    - Cost optimizer for model selection
    - Multi-provider fallback (Anthropic → OpenAI → Google → Mistral → Groq → Local)
.VERSION
    2.0.0
.AUTHOR
    HYDRA System
#>

$script:ConfigPath = Join-Path $PSScriptRoot "ai-config.json"
$script:StatePath = Join-Path $PSScriptRoot "ai-state.json"
$script:PromptOptimizerPath = Join-Path $PSScriptRoot "modules\PromptOptimizer.psm1"
$script:ModelDiscoveryPath = Join-Path $PSScriptRoot "modules\ModelDiscovery.psm1"
$script:PromptQueuePath = Join-Path $PSScriptRoot "modules\PromptQueue.psm1"
$script:SecureStoragePath = Join-Path $PSScriptRoot "modules\SecureStorage.psm1"
$script:AgentSwarmPath = Join-Path $PSScriptRoot "modules\AgentSwarm.psm1"
$script:GoogleProviderPath = Join-Path $PSScriptRoot "providers\GoogleProvider.psm1"
$script:DiscoveredModels = $null

# LAZY LOADING: Sub-modules are loaded on-demand to speed up initial import
# These modules will be imported when their functions are first called
$script:SubModulesLoaded = @{}

function Import-SubModule {
    <#
    .SYNOPSIS
        Lazy-loads a sub-module on first use
    #>
    param([string]$Name, [string]$Path)

    if ($script:SubModulesLoaded[$Name]) { return $true }
    if (-not (Test-Path $Path)) { return $false }

    try {
        Import-Module $Path -Force -ErrorAction SilentlyContinue
        $script:SubModulesLoaded[$Name] = $true
        return $true
    } catch {
        return $false
    }
}

# Register available sub-modules (not loaded yet - lazy)
$script:SubModulePaths = @{
    GoogleProvider  = $script:GoogleProviderPath
    AgentSwarm      = $script:AgentSwarmPath
    PromptOptimizer = $script:PromptOptimizerPath
    ModelDiscovery  = $script:ModelDiscoveryPath
    PromptQueue     = $script:PromptQueuePath
    SecureStorage   = $script:SecureStoragePath
}

#region Helper Functions for PS 5.1 Compatibility

function ConvertTo-Hashtable {
    param([Parameter(ValueFromPipeline)]$InputObject)
    process {
        if ($null -eq $InputObject) { return $null }
        if ($InputObject -is [System.Collections.IEnumerable] -and $InputObject -isnot [string]) {
            $collection = @(foreach ($object in $InputObject) { ConvertTo-Hashtable $object })
            return ,$collection
        } elseif ($InputObject -is [psobject]) {
            $hash = @{}
            foreach ($property in $InputObject.PSObject.Properties) {
                $hash[$property.Name] = ConvertTo-Hashtable $property.Value
            }
            return $hash
        } else {
            return $InputObject
        }
    }
}

#endregion

#region Logging

function Write-AIHandlerLog {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Message,
        [ValidateSet("debug", "info", "warn", "error")]
        [string]$Level = "info",
        [hashtable]$Data = @{}
    )

    $config = Get-AIConfig
    $levels = @("debug", "info", "warn", "error")
    $currentIndex = $levels.IndexOf($config.settings.logLevel)
    $messageIndex = $levels.IndexOf($Level)
    if ($messageIndex -lt $currentIndex) { return }

    if (Get-Command Write-AILog -ErrorAction SilentlyContinue) {
        Write-AILog -Message $Message -Level $Level -Data $Data
    }
}

#endregion

#region Configuration

$script:DefaultConfig = @{
    providers = @{
        anthropic = @{
            name = "Anthropic"
            baseUrl = "https://api.anthropic.com/v1"
            apiKeyEnv = "ANTHROPIC_API_KEY"
            priority = 1
            enabled = $true
            models = @{
                "claude-opus-4-5-20251101" = @{
                    tier = "pro"
                    contextWindow = 200000
                    maxOutput = 32000
                    inputCost = 15.00
                    outputCost = 75.00
                    tokensPerMinute = 40000
                    requestsPerMinute = 50
                    capabilities = @("vision", "code", "analysis", "creative")
                }
                "claude-sonnet-4-5-20250929" = @{
                    tier = "standard"
                    contextWindow = 200000
                    maxOutput = 16000
                    inputCost = 3.00
                    outputCost = 15.00
                    tokensPerMinute = 80000
                    requestsPerMinute = 100
                    capabilities = @("vision", "code", "analysis")
                }
                "claude-haiku-4-20250604" = @{
                    tier = "lite"
                    contextWindow = 200000
                    maxOutput = 8000
                    inputCost = 0.80
                    outputCost = 4.00
                    tokensPerMinute = 100000
                    requestsPerMinute = 200
                    capabilities = @("code", "analysis")
                }
            }
        }
        openai = @{
            name = "OpenAI"
            baseUrl = "https://api.openai.com/v1"
            apiKeyEnv = "OPENAI_API_KEY"
            priority = 2
            enabled = $true
            models = @{
                "gpt-4o" = @{
                    tier = "pro"
                    contextWindow = 128000
                    maxOutput = 16384
                    inputCost = 2.50
                    outputCost = 10.00
                    tokensPerMinute = 30000
                    requestsPerMinute = 500
                    capabilities = @("vision", "code", "analysis")
                }
                "gpt-4o-mini" = @{
                    tier = "lite"
                    contextWindow = 128000
                    maxOutput = 16384
                    inputCost = 0.15
                    outputCost = 0.60
                    tokensPerMinute = 200000
                    requestsPerMinute = 500
                    capabilities = @("code", "analysis")
                }
            }
        }
        google = @{
            name = "Google"
            baseUrl = "https://generativelanguage.googleapis.com/v1beta"
            apiKeyEnv = "GOOGLE_API_KEY"
            priority = 3
            enabled = $true
            models = @{
                "gemini-1.5-pro" = @{
                    tier = "pro"
                    contextWindow = 128000
                    maxOutput = 8192
                    inputCost = 3.50
                    outputCost = 10.50
                    tokensPerMinute = 60000
                    requestsPerMinute = 60
                    capabilities = @("vision", "code", "analysis")
                }
                "gemini-1.5-flash" = @{
                    tier = "lite"
                    contextWindow = 128000
                    maxOutput = 8192
                    inputCost = 0.35
                    outputCost = 1.05
                    tokensPerMinute = 120000
                    requestsPerMinute = 120
                    capabilities = @("vision", "code", "analysis")
                }
            }
        }
        mistral = @{
            name = "Mistral"
            baseUrl = "https://api.mistral.ai/v1"
            apiKeyEnv = "MISTRAL_API_KEY"
            priority = 4
            enabled = $true
            models = @{
                "mistral-large-latest" = @{
                    tier = "pro"
                    contextWindow = 128000
                    maxOutput = 8192
                    inputCost = 2.00
                    outputCost = 6.00
                    tokensPerMinute = 60000
                    requestsPerMinute = 60
                    capabilities = @("code", "analysis")
                }
                "mistral-small-latest" = @{
                    tier = "lite"
                    contextWindow = 32000
                    maxOutput = 8192
                    inputCost = 0.20
                    outputCost = 0.60
                    tokensPerMinute = 120000
                    requestsPerMinute = 120
                    capabilities = @("code", "analysis")
                }
            }
        }
        groq = @{
            name = "Groq"
            baseUrl = "https://api.groq.com/openai/v1"
            apiKeyEnv = "GROQ_API_KEY"
            priority = 5
            enabled = $true
            models = @{
                "llama-3.1-70b-versatile" = @{
                    tier = "pro"
                    contextWindow = 128000
                    maxOutput = 8192
                    inputCost = 0.59
                    outputCost = 0.79
                    tokensPerMinute = 70000
                    requestsPerMinute = 120
                    capabilities = @("code", "analysis")
                }
                "llama-3.1-8b-instant" = @{
                    tier = "lite"
                    contextWindow = 128000
                    maxOutput = 8192
                    inputCost = 0.05
                    outputCost = 0.08
                    tokensPerMinute = 120000
                    requestsPerMinute = 300
                    capabilities = @("code", "analysis")
                }
            }
        }
        ollama = @{
            name = "Ollama (Local)"
            baseUrl = "http://localhost:11434/api"
            apiKeyEnv = $null
            priority = 6
            enabled = $true
            models = @{
                "llama3.3:70b" = @{
                    tier = "standard"
                    contextWindow = 128000
                    maxOutput = 8000
                    inputCost = 0.00
                    outputCost = 0.00
                    tokensPerMinute = 999999
                    requestsPerMinute = 999999
                    capabilities = @("code", "analysis")
                }
                "qwen2.5-coder:32b" = @{
                    tier = "lite"
                    contextWindow = 32000
                    maxOutput = 8000
                    inputCost = 0.00
                    outputCost = 0.00
                    tokensPerMinute = 999999
                    requestsPerMinute = 999999
                    capabilities = @("code")
                }
            }
        }
    }
    fallbackChain = @{
        anthropic = @("claude-opus-4-5-20251101", "claude-sonnet-4-5-20250929", "claude-haiku-4-20250604")
        openai = @("gpt-4o", "gpt-4o-mini")
        google = @("gemini-1.5-pro", "gemini-1.5-flash")
        mistral = @("mistral-large-latest", "mistral-small-latest")
        groq = @("llama-3.1-70b-versatile", "llama-3.1-8b-instant")
        ollama = @("llama3.3:70b", "qwen2.5-coder:32b")
    }
    providerFallbackOrder = @("anthropic", "openai", "google", "mistral", "groq", "ollama")
    settings = @{
        maxRetries = 1
        retryDelayMs = 500
        rateLimitThreshold = 0.95
        costOptimization = $false
        autoFallback = $true
        useSwarmByDefault = $true
        defaultTaskType = "general"
        logLevel = "info"
        logFormat = "json"
        streamResponses = $true
        outputTokenRatio = 0.5
        # YOLO Mode - read from environment variable (set by _launcher.ps1)
        yoloMode = ($env:HYDRA_YOLO_MODE -eq 'true')
        yoloSettings = @{
            maxConcurrent = if ($env:HYDRA_YOLO_MODE -eq 'true') { 10 } else { 5 }
            retryAttempts = if ($env:HYDRA_YOLO_MODE -eq 'true') { 1 } else { 3 }
            timeout = if ($env:HYDRA_YOLO_MODE -eq 'true') { 15000 } else { 60000 }
            riskBlocking = if ($env:HYDRA_YOLO_MODE -eq 'true') { $false } else { $true }
        }
        promptRiskBlock = if ($env:HYDRA_YOLO_MODE -eq 'true') { $false } else { $true }
        # Deep Thinking - read from environment variable
        deepThinking = @{
            enabled = ($env:HYDRA_DEEP_THINKING -eq 'true')
            provider = "google"
            model = "gemini-flash-thinking"  # Alias -> resolved dynamically
            thinkingBudget = 24576
            useForPlanning = $true
            useForSynthesis = $true
        }
        # Deep Research - read from environment variable
        deepResearch = @{
            enabled = ($env:HYDRA_DEEP_RESEARCH -eq 'true')
            provider = "google"
            model = "gemini-pro-research"  # Alias -> resolved dynamically
            useGoogleSearch = $true
            maxSearchResults = 10
            synthesizeResults = $true
            researchDepth = "thorough"  # quick, moderate, thorough
        }
        modelDiscovery = @{
            enabled = $true
            updateConfigOnStart = $true
            parallel = $true
            skipValidation = $false
        }
        # Model Alias System - maps logical names to actual model versions
        # Resolved dynamically at runtime via Resolve-ModelAlias
        modelAliases = @{
            # Google Gemini aliases (auto-resolved to latest available)
            "gemini-pro-latest"      = $null  # Resolved from API
            "gemini-flash-latest"    = $null  # Resolved from API
            "gemini-pro-research"    = $null  # Best for research tasks
            "gemini-flash-thinking"  = $null  # Best for thinking/reasoning
            "gemini-pro-planning"    = $null  # Best for planning
            "gemini-flash-fast"      = $null  # Fastest available
            # Anthropic aliases
            "claude-best"            = "claude-opus-4-5-20251101"
            "claude-balanced"        = "claude-sonnet-4-5-20250929"
            "claude-fast"            = "claude-haiku-4-20250604"
            # OpenAI aliases
            "gpt-best"               = "gpt-4o"
            "gpt-fast"               = "gpt-4o-mini"
            # Ollama aliases (local)
            "local-best"             = "llama3.2:3b"
            "local-coder"            = "qwen2.5-coder:1.5b"
            "local-fast"             = "llama3.2:1b"
            "local-analytical"       = "phi3:mini"
        }
    }
}

#endregion

#region State Management

$script:RuntimeState = @{
    currentProvider = "anthropic"
    currentModel = "claude-sonnet-4-5-20250929"
    usage = @{}
    errors = @()
    lastRequest = $null
}

function Get-AIConfig {
    [CmdletBinding()]
    param()

    if (Test-Path $script:ConfigPath) {
        try {
            $config = Get-Content $script:ConfigPath -Raw | ConvertFrom-Json | ConvertTo-Hashtable
            return $config
        } catch {
            Write-Warning "Failed to load config, using defaults: $_"
        }
    }
    return $script:DefaultConfig
}

function Save-AIConfig {
    [CmdletBinding()]
    param([hashtable]$Config)

    $json = $Config | ConvertTo-Json -Depth 10
    if (Get-Command Write-AtomicFile -ErrorAction SilentlyContinue) {
        Write-AtomicFile -Path $script:ConfigPath -Content $json
    } else {
        $json | Set-Content $script:ConfigPath -Encoding UTF8
    }
    Write-Host "[AI] Config saved to $script:ConfigPath" -ForegroundColor Green
}

function Get-AIState {
    [CmdletBinding()]
    param()

    if (Test-Path $script:StatePath) {
        try {
            if (Get-Command Read-EncryptedJson -ErrorAction SilentlyContinue) {
                $state = Read-EncryptedJson -Path $script:StatePath
                if ($state) { return $state }
            }
            return Get-Content $script:StatePath -Raw | ConvertFrom-Json | ConvertTo-Hashtable
        } catch {
            Write-Warning "Failed to load state, using runtime state"
        }
    }
    return $script:RuntimeState
}

function Save-AIState {
    [CmdletBinding()]
    param([hashtable]$State)

    if (Get-Command Write-EncryptedJson -ErrorAction SilentlyContinue) {
        Write-EncryptedJson -Data $State -Path $script:StatePath
    } else {
        $State | ConvertTo-Json -Depth 10 | Set-Content $script:StatePath -Encoding UTF8
    }
}

function Get-YoloSettings {
    <#
    .SYNOPSIS
        Returns current YOLO mode settings based on environment variable
    .DESCRIPTION
        Reads $env:HYDRA_YOLO_MODE and returns appropriate settings.
        YOLO mode = Fast & Dangerous (less retries, lower timeouts, no risk blocking)
        Standard mode = Safe & Reliable (more retries, higher timeouts, risk blocking)
    #>
    [CmdletBinding()]
    param()

    $isYolo = ($env:HYDRA_YOLO_MODE -eq 'true')

    return @{
        enabled = $isYolo
        maxConcurrent = if ($isYolo) { 10 } else { 5 }
        retryAttempts = if ($isYolo) { 1 } else { 3 }
        timeout = if ($isYolo) { 15000 } else { 60000 }
        riskBlocking = -not $isYolo
        promptRiskBlock = -not $isYolo
        retryDelayMs = if ($isYolo) { 500 } else { 1000 }
    }
}

function Get-DeepModeSettings {
    <#
    .SYNOPSIS
        Returns Deep Thinking and Deep Research settings from environment
    #>
    [CmdletBinding()]
    param()

    return @{
        deepThinking = @{
            enabled = ($env:HYDRA_DEEP_THINKING -eq 'true')
            model = "gemini-flash-thinking"
        }
        deepResearch = @{
            enabled = ($env:HYDRA_DEEP_RESEARCH -eq 'true')
            model = "gemini-pro-research"
        }
    }
}

function Get-TurboSettings {
    <#
    .SYNOPSIS
        Returns Turbo Mode settings for parallel pipeline execution
    .DESCRIPTION
        Turbo Mode = 4 pre-warmed agents executing pipeline in parallel
        - 4x throughput for batch operations
        - Pre-loaded models in memory
        - Shared context between agents
    #>
    [CmdletBinding()]
    param()

    $isTurbo = ($env:HYDRA_TURBO_MODE -eq 'true')

    return @{
        enabled = $isTurbo
        agentCount = if ($isTurbo) { 4 } else { 1 }
        preWarm = $isTurbo
        sharedContext = $isTurbo
        parallelPipelines = if ($isTurbo) { 4 } else { 1 }
        # Turbo uses fast models for speed
        defaultModel = if ($isTurbo) { "gemini-flash-fast" } else { "gemini-pro-planning" }
        # Memory settings for pre-warmed agents
        keepAliveMs = if ($isTurbo) { 300000 } else { 0 }  # 5 min keep-alive
    }
}

# Cache for resolved model aliases (refreshed on module load or manual call)
$script:ResolvedAliases = @{}
$script:AliasResolutionTime = $null

function Resolve-ModelAlias {
    <#
    .SYNOPSIS
        Resolves a model alias to the actual model ID available from the API
    .DESCRIPTION
        Takes a logical alias (e.g., "gemini-pro-latest") and returns the actual
        model ID from the provider's API. Caches results for performance.
    .PARAMETER Alias
        The model alias to resolve (e.g., "gemini-flash-thinking", "claude-best")
    .PARAMETER Provider
        Optional provider hint for faster resolution
    .PARAMETER ForceRefresh
        Force refresh of cached aliases from API
    .EXAMPLE
        Resolve-ModelAlias -Alias "gemini-pro-research"
        # Returns: "gemini-2.5-pro-preview-05-06" (or latest available)
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Alias,

        [ValidateSet("google", "anthropic", "openai", "ollama", "mistral", "groq")]
        [string]$Provider,

        [switch]$ForceRefresh
    )

    $config = Get-AIConfig
    $knownAliases = @()
    if ($config.settings.modelAliases) {
        $knownAliases = @($config.settings.modelAliases.Keys)
    }

    # If not a known alias, return as-is (direct model name)
    if ($knownAliases.Count -eq 0 -or $Alias -notin $knownAliases) {
        return $Alias
    }

    # Check cache (valid for 1 hour)
    $cacheValid = $script:AliasResolutionTime -and `
                  ((Get-Date) - $script:AliasResolutionTime).TotalHours -lt 1

    if (-not $ForceRefresh -and $cacheValid -and $script:ResolvedAliases[$Alias]) {
        return $script:ResolvedAliases[$Alias]
    }

    # Check static aliases first (non-null values = static mapping)
    $staticValue = $config.settings.modelAliases[$Alias]
    if ($staticValue -and $staticValue -ne $null) {
        $script:ResolvedAliases[$Alias] = $staticValue
        return $staticValue
    }

    # Dynamic resolution for Google/Gemini models (aliases with $null value)
    if ($Alias -like "gemini-*") {
        $resolved = Resolve-GeminiAlias -Alias $Alias
        if ($resolved) {
            $script:ResolvedAliases[$Alias] = $resolved
            $script:AliasResolutionTime = Get-Date
            return $resolved
        }
    }

    # Fallback: return alias as-is (caller will handle missing model)
    Write-Verbose "Could not resolve alias '$Alias' - using as-is"
    return $Alias
}

function Resolve-GeminiAlias {
    <#
    .SYNOPSIS
        Resolves Gemini-specific aliases to latest available models
    .DESCRIPTION
        Queries Google's API to find the best matching model for the alias.
        Prefers stable > preview > experimental versions.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Alias
    )

    # Trigger lazy init if needed (first-time model access)
    if (Get-Command Invoke-LazyInit -ErrorAction SilentlyContinue) {
        Invoke-LazyInit
    }

    # Get available Gemini models from discovery cache
    $geminiModels = @()

    if ($script:DiscoveredModels -and $script:DiscoveredModels.google) {
        $geminiModels = $script:DiscoveredModels.google
    }

    # If no cached models, use known stable models (FAST - no API call)
    if ($geminiModels.Count -eq 0) {
        # Use well-known stable models as fallback - no network call needed
        $geminiModels = @(
            "gemini-2.5-pro", "gemini-2.5-flash",
            "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"
        )
    }

    # Define alias resolution patterns (priority order)
    $patterns = switch -Wildcard ($Alias) {
        "gemini-pro-latest" {
            @("gemini-*-pro", "gemini-*-pro-*")
        }
        "gemini-flash-latest" {
            @("gemini-*-flash", "gemini-*-flash-*")
        }
        "gemini-pro-research" {
            # Research needs grounding/search support - prefer pro models
            @("gemini-2.5-pro*", "gemini-2.0-pro*", "gemini-*-pro*")
        }
        "gemini-flash-thinking" {
            # Thinking needs reasoning - flash with thinking support
            @("gemini-2.5-flash*", "gemini-2.0-flash-thinking*", "gemini-*-flash*")
        }
        "gemini-pro-planning" {
            # Planning needs deep reasoning - pro models
            @("gemini-2.5-pro*", "gemini-*-pro*")
        }
        "gemini-flash-fast" {
            # Speed priority - any flash, prefer lite
            @("gemini-*-flash-lite*", "gemini-*-flash*", "gemini-flash*")
        }
        default {
            @("gemini-*")
        }
    }

    # Find best match (prefer stable > preview > exp, newer version > older)
    $versionPriority = @{
        "stable"  = 100
        "preview" = 50
        "exp"     = 25
        "latest"  = 75
    }

    $bestMatch = $null
    $bestScore = -1

    foreach ($model in $geminiModels) {
        foreach ($pattern in $patterns) {
            if ($model -like $pattern) {
                # Calculate score
                $score = 0

                # Version score (2.5 > 2.0 > 1.5)
                if ($model -match "gemini-(\d+\.?\d*)") {
                    $version = [double]$Matches[1]
                    $score += $version * 100
                }

                # Stability score
                foreach ($key in $versionPriority.Keys) {
                    if ($model -like "*$key*" -or $model -like "*-$key*") {
                        $score += $versionPriority[$key]
                        break
                    }
                }

                # No suffix = stable (highest priority)
                if ($model -notmatch "(preview|exp|experimental|latest)") {
                    $score += 150
                }

                if ($score -gt $bestScore) {
                    $bestScore = $score
                    $bestMatch = $model
                }
                break  # Found match for this pattern, check next model
            }
        }
    }

    return $bestMatch
}

function Update-ModelAliases {
    <#
    .SYNOPSIS
        Force refresh all model aliases from APIs
    .DESCRIPTION
        Queries all configured providers and updates the alias cache
    #>
    [CmdletBinding()]
    param()

    Write-Host "[AI] Refreshing model aliases..." -ForegroundColor Cyan

    $config = Get-AIConfig
    $aliases = $config.settings.modelAliases.Keys

    $script:ResolvedAliases = @{}

    foreach ($alias in $aliases) {
        $resolved = Resolve-ModelAlias -Alias $alias -ForceRefresh
        if ($resolved -and $resolved -ne $alias) {
            Write-Host "  $alias -> " -NoNewline -ForegroundColor DarkGray
            Write-Host $resolved -ForegroundColor Green
        }
    }

    $script:AliasResolutionTime = Get-Date
    Write-Host "[AI] Aliases updated at $($script:AliasResolutionTime.ToString('HH:mm:ss'))" -ForegroundColor Green
}

function Get-ResolvedModel {
    <#
    .SYNOPSIS
        Gets the actual model ID, resolving aliases if needed
    .DESCRIPTION
        Wrapper that handles both direct model IDs and aliases transparently
    .PARAMETER ModelOrAlias
        Model ID or alias to resolve
    .EXAMPLE
        Get-ResolvedModel "gemini-flash-thinking"  # Returns actual model ID
        Get-ResolvedModel "gpt-4o"                 # Returns "gpt-4o" (not an alias)
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$ModelOrAlias
    )

    return Resolve-ModelAlias -Alias $ModelOrAlias
}

function Get-FallbackAlias {
    <#
    .SYNOPSIS
        Gets the next available model from a fallback chain for a task type
    .DESCRIPTION
        When the primary model fails, this function returns the next available
        model from the fallback chain. It checks API key availability and
        provider health before suggesting a fallback.
    .PARAMETER TaskType
        Type of task: planning, research, thinking, fast, coding, general
    .PARAMETER SkipAliases
        Array of aliases to skip (already tried and failed)
    .PARAMETER CheckAvailability
        If true, only returns aliases with available providers
    .EXAMPLE
        Get-FallbackAlias -TaskType "planning"
        # Returns first available alias from planning chain

        Get-FallbackAlias -TaskType "fast" -SkipAliases @("gemini-flash-fast")
        # Returns "gpt-fast" (next in chain after skipping gemini)
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateSet("planning", "research", "thinking", "fast", "coding", "general")]
        [string]$TaskType,

        [string[]]$SkipAliases = @(),

        [switch]$CheckAvailability
    )

    $config = Get-AIConfig

    # Get fallback chain for task type
    $chain = $config.settings.aliasFallbackChains[$TaskType]
    if (-not $chain -or $chain.Count -eq 0) {
        $chain = $config.settings.aliasFallbackChains["general"]
    }

    foreach ($alias in $chain) {
        # Skip already tried aliases
        if ($alias -in $SkipAliases) {
            continue
        }

        if ($CheckAvailability) {
            # Check if provider for this alias is available
            $available = Test-AliasAvailability -Alias $alias
            if (-not $available) {
                continue
            }
        }

        # Resolve and return the alias
        $resolved = Resolve-ModelAlias -Alias $alias
        return @{
            Alias = $alias
            Model = $resolved
            TaskType = $TaskType
        }
    }

    # No fallback available
    Write-Warning "No available fallback for task type '$TaskType'"
    return $null
}

function Test-AliasAvailability {
    <#
    .SYNOPSIS
        Tests if a model alias's provider is available
    .DESCRIPTION
        Checks API keys and provider connectivity for an alias
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Alias
    )

    # Determine provider from alias prefix
    $provider = switch -Wildcard ($Alias) {
        "gemini-*"  { "google" }
        "claude-*"  { "anthropic" }
        "gpt-*"     { "openai" }
        "local-*"   { "ollama" }
        default     { "unknown" }
    }

    # Check availability
    switch ($provider) {
        "google" {
            return [bool]($env:GOOGLE_API_KEY -or $env:GEMINI_API_KEY)
        }
        "anthropic" {
            return [bool]$env:ANTHROPIC_API_KEY
        }
        "openai" {
            return [bool]$env:OPENAI_API_KEY
        }
        "ollama" {
            return Test-OllamaAvailable
        }
        default {
            return $false
        }
    }
}

function Get-ModelForTask {
    <#
    .SYNOPSIS
        Gets the best available model for a specific task type
    .DESCRIPTION
        Combines alias resolution with fallback chains to get the best
        available model for a task. Automatically falls back if primary
        provider is unavailable.
    .PARAMETER TaskType
        Type of task: planning, research, thinking, fast, coding, general
    .PARAMETER PreferLocal
        If true, prefer local Ollama models over cloud
    .EXAMPLE
        Get-ModelForTask -TaskType "planning"
        # Returns best available model for planning tasks
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateSet("planning", "research", "thinking", "fast", "coding", "general")]
        [string]$TaskType,

        [switch]$PreferLocal
    )

    $config = Get-AIConfig

    # Get fallback chain
    $chain = $config.settings.aliasFallbackChains[$TaskType]
    if (-not $chain) { $chain = $config.settings.aliasFallbackChains["general"] }

    # If prefer local, reorder chain
    if ($PreferLocal) {
        $localAliases = $chain | Where-Object { $_ -like "local-*" }
        $cloudAliases = $chain | Where-Object { $_ -notlike "local-*" }
        $chain = @($localAliases) + @($cloudAliases)
    }

    # Find first available
    foreach ($alias in $chain) {
        if (Test-AliasAvailability -Alias $alias) {
            $resolved = Resolve-ModelAlias -Alias $alias
            $provider = switch -Wildcard ($alias) {
                "gemini-*"  { "google" }
                "claude-*"  { "anthropic" }
                "gpt-*"     { "openai" }
                "local-*"   { "ollama" }
                default     { "unknown" }
            }
            return @{
                Alias    = $alias
                Model    = $resolved
                Provider = $provider
                TaskType = $TaskType
            }
        }
    }

    Write-Warning "No available model for task type '$TaskType'"
    return $null
}

function Initialize-AIState {
    [CmdletBinding()]
    param()

    $config = Get-AIConfig
    if ($config.settings.modelDiscovery.enabled -and -not (Get-Command Initialize-ModelDiscovery -ErrorAction SilentlyContinue)) {
        Import-SubModule -Name "ModelDiscovery" -Path $script:ModelDiscoveryPath | Out-Null
    }
    if ($config.settings.modelDiscovery.enabled -and (Get-Command Initialize-ModelDiscovery -ErrorAction SilentlyContinue)) {
        try {
            $discovery = Initialize-ModelDiscovery -UpdateConfig:$config.settings.modelDiscovery.updateConfigOnStart `
                -Silent -SkipValidation:$config.settings.modelDiscovery.skipValidation `
                -Parallel:$config.settings.modelDiscovery.parallel -ErrorAction SilentlyContinue
            if ($discovery) {
                $script:DiscoveredModels = $discovery
            }
        } catch {
            Write-Warning "Model discovery failed: $($_.Exception.Message)"
        }
    }
    $state = Get-AIState

    # Ensure usage hashtable exists
    if (-not $state.usage -or $state.usage -isnot [hashtable]) {
        $state.usage = @{}
    }

    # Initialize usage tracking per provider/model
    foreach ($providerName in $config.providers.Keys) {
        if (-not $state.usage.ContainsKey($providerName)) {
            $state.usage[$providerName] = @{}
        }
        $providerModels = $config.providers[$providerName].models
        if ($providerModels -and $providerModels.Keys) {
            foreach ($modelName in $providerModels.Keys) {
                if (-not $state.usage[$providerName].ContainsKey($modelName)) {
                    $state.usage[$providerName][$modelName] = @{
                        tokensThisMinute = 0
                        requestsThisMinute = 0
                        lastMinuteReset = (Get-Date).ToString("o")
                        totalTokens = 0
                        totalRequests = 0
                        totalCost = 0.0
                        errors = 0
                    }
                }
            }
        }
    }

    $script:RuntimeState = $state
    Save-AIState $state
    return $state
}

#endregion

#region Rate Limiting

function Update-UsageTracking {
    [CmdletBinding()]
    param(
        [string]$Provider,
        [string]$Model,
        [int]$InputTokens = 0,
        [int]$OutputTokens = 0,
        [bool]$IsError = $false
    )

    $config = Get-AIConfig
    $state = Get-AIState
    $now = Get-Date

    # Ensure nested hashtables exist
    if (-not $state.usage[$Provider]) {
        $state.usage[$Provider] = @{}
    }
    if (-not $state.usage[$Provider][$Model]) {
        $state.usage[$Provider][$Model] = @{
            tokensThisMinute = 0
            requestsThisMinute = 0
            lastMinuteReset = $now.ToString("o")
            totalTokens = 0
            totalRequests = 0
            totalCost = 0.0
            errors = 0
        }
    }

    $usage = $state.usage[$Provider][$Model]
    $lastReset = [DateTime]::Parse($usage.lastMinuteReset)

    # Reset minute counters if a minute has passed
    if (($now - $lastReset).TotalMinutes -ge 1) {
        $usage.tokensThisMinute = 0
        $usage.requestsThisMinute = 0
        $usage.lastMinuteReset = $now.ToString("o")
    }

    # Update counters
    $totalTokens = $InputTokens + $OutputTokens
    $usage.tokensThisMinute += $totalTokens
    $usage.requestsThisMinute += 1
    $usage.totalTokens += $totalTokens
    $usage.totalRequests += 1

    if ($IsError) {
        $usage.errors += 1
    }

    # Calculate cost
    $modelConfig = $config.providers[$Provider].models[$Model]
    if ($modelConfig) {
        $cost = (($InputTokens / 1000000) * $modelConfig.inputCost) +
                (($OutputTokens / 1000000) * $modelConfig.outputCost)
        $usage.totalCost += $cost
    }

    $state.usage[$Provider][$Model] = $usage
    $script:RuntimeState = $state
    Save-AIState $state

    return $usage
}

function Get-RateLimitStatus {
    [CmdletBinding()]
    param(
        [string]$Provider,
        [string]$Model
    )

    $config = Get-AIConfig
    $state = Get-AIState

    $modelConfig = $config.providers[$Provider].models[$Model]
    if (-not $modelConfig) {
        return @{ available = $false; reason = "Model not found" }
    }

    $usage = $state.usage[$Provider][$Model]
    if (-not $usage) {
        return @{ available = $true; tokensPercent = 0; requestsPercent = 0 }
    }

    # Check if minute has reset
    $now = Get-Date
    $lastReset = [DateTime]::Parse($usage.lastMinuteReset)
    if (($now - $lastReset).TotalMinutes -ge 1) {
        return @{ available = $true; tokensPercent = 0; requestsPercent = 0 }
    }

    $tokensPercent = if ($modelConfig.tokensPerMinute -gt 0) {
        ($usage.tokensThisMinute / $modelConfig.tokensPerMinute) * 100
    } else { 0 }

    $requestsPercent = if ($modelConfig.requestsPerMinute -gt 0) {
        ($usage.requestsThisMinute / $modelConfig.requestsPerMinute) * 100
    } else { 0 }

    $threshold = $config.settings.rateLimitThreshold * 100

    return @{
        available = ($tokensPercent -lt $threshold) -and ($requestsPercent -lt $threshold)
        tokensPercent = [math]::Round($tokensPercent, 1)
        requestsPercent = [math]::Round($requestsPercent, 1)
        tokensRemaining = $modelConfig.tokensPerMinute - $usage.tokensThisMinute
        requestsRemaining = $modelConfig.requestsPerMinute - $usage.requestsThisMinute
        threshold = $threshold
    }
}

#endregion

#region Model Selection

function Get-OptimalModel {
    <#
    .SYNOPSIS
        Selects the optimal model based on task requirements and constraints
    .PARAMETER Task
        Type of task: "simple", "complex", "creative", "code", "vision"
    .PARAMETER EstimatedTokens
        Estimated input tokens for cost calculation
    .PARAMETER RequiredCapabilities
        Array of required capabilities
    .PARAMETER PreferCheapest
        Force selection of cheapest suitable model
    .PARAMETER PreferredProvider
        Preferred provider to start with
    #>
    [CmdletBinding()]
    param(
        [ValidateSet("simple", "complex", "creative", "code", "vision", "analysis")]
        [string]$Task = "simple",
        [int]$EstimatedTokens = 1000,
        [int]$EstimatedOutputTokens = 0,
        [string[]]$RequiredCapabilities = @(),
        [switch]$PreferCheapest,
        [string]$PreferredProvider = "anthropic"
    )

    $config = Get-AIConfig
    $candidates = @()

    # Task to tier mapping
    $taskTierMap = @{
        "simple" = @("lite", "standard", "pro")
        "code" = @("standard", "lite", "pro")
        "analysis" = @("standard", "pro", "lite")
        "complex" = @("pro", "standard")
        "creative" = @("pro", "standard")
        "vision" = @("pro", "standard")
    }

    $preferredTiers = $taskTierMap[$Task]

    # Build candidate list from all providers
    foreach ($providerName in $config.providerFallbackOrder) {
        $provider = $config.providers[$providerName]
        if (-not $provider.enabled) { continue }

        # Check API key availability
        if ($provider.apiKeyEnv -and -not [Environment]::GetEnvironmentVariable($provider.apiKeyEnv)) {
            continue
        }

        foreach ($modelName in $provider.models.Keys) {
            $model = $provider.models[$modelName]

            # Skip embedding, image, and non-chat models
            if ($modelName -match 'embedding|imagen|tts|whisper|dall-e|moderation') {
                continue
            }

            # Check capabilities
            $hasCapabilities = $true
            foreach ($cap in $RequiredCapabilities) {
                if ($cap -notin $model.capabilities) {
                    $hasCapabilities = $false
                    break
                }
            }
            if (-not $hasCapabilities) { continue }

            # Check rate limits
            $rateStatus = Get-RateLimitStatus -Provider $providerName -Model $modelName
            if (-not $rateStatus.available) { continue }

            # Calculate estimated cost
            $outputTokens = if ($EstimatedOutputTokens -gt 0) {
                $EstimatedOutputTokens
            } else {
                [math]::Round($EstimatedTokens * $config.settings.outputTokenRatio)
            }
            $estimatedCost = ($EstimatedTokens / 1000000) * $model.inputCost +
                            ($outputTokens / 1000000) * $model.outputCost

            # Calculate score
            $tierScore = switch ($model.tier) {
                "pro" { 3 }
                "standard" { 2 }
                "lite" { 1 }
            }

            $tierPreference = $preferredTiers.IndexOf($model.tier)
            if ($tierPreference -eq -1) { $tierPreference = 99 }

            $providerPreference = $config.providerFallbackOrder.IndexOf($providerName)
            if ($providerName -eq $PreferredProvider) {
                $providerPreference = -1
            }

            $candidates += @{
                provider = $providerName
                model = $modelName
                tier = $model.tier
                cost = $estimatedCost
                tierScore = $tierScore
                tierPreference = $tierPreference
                providerPreference = $providerPreference
                rateStatus = $rateStatus
            }
        }
    }

    if ($candidates.Count -eq 0) {
        Write-Warning "[AI] No suitable models available"
        return $null
    }

    # Sort candidates
    if ($PreferCheapest -or $config.settings.costOptimization) {
        $sorted = $candidates | Sort-Object cost, tierPreference, providerPreference
    } else {
        $sorted = $candidates | Sort-Object tierPreference, providerPreference, cost
    }

    $selected = $sorted[0]

    Write-Host "[AI] Selected: $($selected.provider)/$($selected.model) " -NoNewline -ForegroundColor Cyan
    Write-Host "(tier: $($selected.tier), est. cost: `$$([math]::Round($selected.cost, 4)))" -ForegroundColor Gray

    return $selected
}

function Get-FallbackModel {
    <#
    .SYNOPSIS
        Gets the next fallback model in the chain
    #>
    [CmdletBinding()]
    param(
        [string]$CurrentProvider,
        [string]$CurrentModel,
        [switch]$CrossProvider
    )

    $config = Get-AIConfig

    # Try same provider first
    $chain = $config.fallbackChain[$CurrentProvider]
    if ($chain) {
        $currentIndex = $chain.IndexOf($CurrentModel)
        if ($currentIndex -ge 0 -and $currentIndex -lt ($chain.Count - 1)) {
            $nextModel = $chain[$currentIndex + 1]
            $rateStatus = Get-RateLimitStatus -Provider $CurrentProvider -Model $nextModel
            if ($rateStatus.available) {
                return @{ provider = $CurrentProvider; model = $nextModel }
            }
        }
    }

    # Try other providers if allowed
    if ($CrossProvider) {
        foreach ($providerName in $config.providerFallbackOrder) {
            if ($providerName -eq $CurrentProvider) { continue }

            $provider = $config.providers[$providerName]
            if (-not $provider.enabled) { continue }

            # Check API key
            if ($provider.apiKeyEnv -and -not [Environment]::GetEnvironmentVariable($provider.apiKeyEnv)) {
                continue
            }

            $providerChain = $config.fallbackChain[$providerName]
            if ($providerChain -and $providerChain.Count -gt 0) {
                $firstModel = $providerChain[0]
                $rateStatus = Get-RateLimitStatus -Provider $providerName -Model $firstModel
                if ($rateStatus.available) {
                    Write-Host "[AI] Switching to provider: $providerName" -ForegroundColor Yellow
                    return @{ provider = $providerName; model = $firstModel }
                }
            }
        }
    }

    return $null
}

#endregion

#region API Invocation with Retry

function Invoke-AIRequest {
    <#
    .SYNOPSIS
        Invokes an AI request with automatic retry and fallback or using the Agent Swarm protocol.
    .PARAMETER Messages
        Array of message objects
    .PARAMETER Provider
        Provider name (anthropic, openai, google, mistral, groq, ollama)
    .PARAMETER Model
        Model identifier
    .PARAMETER MaxTokens
        Maximum output tokens
    .PARAMETER Temperature
        Sampling temperature
    .PARAMETER AutoFallback
        Enable automatic fallback on errors
    .PARAMETER OptimizePrompt
        Automatically enhance prompts before sending (uses PromptOptimizer module)
    .PARAMETER ShowOptimization
        Display prompt optimization details
    .PARAMETER NoOptimize
        Disable auto-optimization (send raw prompt)
    .PARAMETER Swarm
        Use the Agent Swarm protocol for this request.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [array]$Messages,
        [string]$Provider = "anthropic",
        [string]$Model,
        [int]$MaxTokens = 4096,
        [float]$Temperature = 0.7,
        [switch]$AutoFallback,
        [switch]$Stream,
        [switch]$OptimizePrompt,
        [switch]$ShowOptimization,
        [switch]$NoOptimize,
        [switch]$Swarm,
        [array]$Tools
    )

    # If -Swarm is specified, delegate to the AgentSwarm module
    if ($Swarm.IsPresent) {
        if (Get-Command Invoke-AgentSwarm -ErrorAction SilentlyContinue) {
            # Extract the user prompt for the swarm
            $userPrompt = ($Messages | Where-Object { $_.role -eq 'user' } | Select-Object -Last 1).content
            if ($userPrompt) {
                return Invoke-AgentSwarm -Prompt $userPrompt
            } else {
                throw "Agent Swarm requires a user prompt."
            }
        } else {
            throw "AgentSwarm module is not available. Cannot use -Swarm flag."
        }
    }

    $config = Get-AIConfig
    $maxRetries = $config.settings.maxRetries
    $retryDelay = $config.settings.retryDelayMs

    # Apply prompt optimization if enabled (auto or explicit, unless -NoOptimize)
    $optimizationResult = $null
    $autoOptimize = $config.settings.advancedAI.promptOptimizer.autoOptimize -eq $true
    $shouldOptimize = (-not $NoOptimize) -and ($OptimizePrompt -or $autoOptimize)
    $showOpt = $ShowOptimization -or ($config.settings.advancedAI.promptOptimizer.showEnhancements -eq $true)

    if ($shouldOptimize -and (Get-Command Optimize-Prompt -ErrorAction SilentlyContinue)) {
        # Find user message to optimize
        for ($i = 0; $i -lt $Messages.Count; $i++) {
            if ($Messages[$i].role -eq "user") {
                $originalContent = $Messages[$i].content
                $optimizationResult = Optimize-Prompt -Prompt $originalContent -Model $Model -Detailed

                if ($optimizationResult.WasEnhanced) {
                    $Messages[$i].content = $optimizationResult.OptimizedPrompt

                    if ($showOpt) {
                        Write-Host "`n[Prompt Optimizer]" -ForegroundColor Cyan
                        Write-Host "Category: $($optimizationResult.Category)" -ForegroundColor Gray
                        Write-Host "Clarity: $($optimizationResult.ClarityScore)/100" -ForegroundColor Gray
                        Write-Host "Enhancements: $($optimizationResult.Enhancements -join ', ')" -ForegroundColor Gray
                        Write-Host ""
                    }
                }
                break  # Only optimize first user message
            }
        }
    }

    # Auto-select model if not specified
    if (-not $Model) {
        $taskType = "general"
        if ($config.settings.defaultTaskType -and $config.settings.aliasFallbackChains -and
            $config.settings.aliasFallbackChains.ContainsKey($config.settings.defaultTaskType)) {
            $taskType = $config.settings.defaultTaskType
        }

        $auto = $null
        if ($config.settings.aliasFallbackChains) {
            $auto = Get-ModelForTask -TaskType $taskType -PreferLocal:($config.settings.preferLocal -eq $true)
        }

        if ($auto) {
            $Provider = $auto.Provider
            $Model = $auto.Model
        } else {
            $optimal = Get-OptimalModel -Task "simple" -EstimatedTokens ($Messages | ConvertTo-Json | Measure-Object -Character).Characters
            if ($optimal) {
                $Provider = $optimal.provider
                $Model = $optimal.model
            } else {
                throw "Brak dostępnych modeli."
            }
        }
    }

    if ($Model) {
        $Model = Resolve-ModelAlias -Alias $Model
    }

    $currentProvider = $Provider
    $currentModel = $Model
    $attempt = 0
    $lastError = $null

    while ($attempt -lt $maxRetries) {
        $attempt++

        try {
            Write-Host "[AI] Request #$attempt to $currentProvider/$currentModel" -ForegroundColor Cyan
            Write-AIHandlerLog -Level "info" -Message "AI request started." -Data @{
                provider = $currentProvider
                model = $currentModel
                attempt = $attempt
            }

            # Check rate limits before request
            $rateStatus = Get-RateLimitStatus -Provider $currentProvider -Model $currentModel
            if (-not $rateStatus.available) {
                Write-Warning "[AI] Rate limit threshold reached (tokens: $($rateStatus.tokensPercent)%, requests: $($rateStatus.requestsPercent)%)"

                if ($AutoFallback -or $config.settings.autoFallback) {
                    $fallback = Get-FallbackModel -CurrentProvider $currentProvider -CurrentModel $currentModel -CrossProvider
                    if ($fallback) {
                        $currentProvider = $fallback.provider
                        $currentModel = $fallback.model
                        Write-Host "[AI] Falling back to $currentProvider/$currentModel" -ForegroundColor Yellow
                        continue
                    }
                }

                throw "Przekroczono limit i brak dostępnego fallbacku."
            }

            # Make the actual API call
            $result = Invoke-ProviderAPI -Provider $currentProvider -Model $currentModel `
                -Messages $Messages -MaxTokens $MaxTokens -Temperature $Temperature -Stream:$Stream `
                -Tools $Tools

            # Update usage tracking
            $inputTokens = if ($result.usage) { $result.usage.input_tokens } else { 0 }
            $outputTokens = if ($result.usage) { $result.usage.output_tokens } else { 0 }
            Update-UsageTracking -Provider $currentProvider -Model $currentModel `
                -InputTokens $inputTokens -OutputTokens $outputTokens

            # Add metadata to result
            $metaData = @{
                provider = $currentProvider
                model = $currentModel
                attempt = $attempt
                timestamp = (Get-Date).ToString("o")
            }

            # Include optimization info if applied
            if ($optimizationResult -and $optimizationResult.WasEnhanced) {
                $metaData.promptOptimization = @{
                    category = $optimizationResult.Category
                    clarityScore = $optimizationResult.ClarityScore
                    enhancements = $optimizationResult.Enhancements
                }
            }

            $result | Add-Member -NotePropertyName "_meta" -NotePropertyValue $metaData -Force

            Write-AIHandlerLog -Level "info" -Message "AI request completed." -Data @{
                provider = $currentProvider
                model = $currentModel
                attempt = $attempt
                inputTokens = $inputTokens
                outputTokens = $outputTokens
            }

            if (($inputTokens + $outputTokens) -eq 0 -and (Get-Command Write-AILog -ErrorAction SilentlyContinue)) {
                Write-AILog -Level "warn" -Message "Token usage unavailable for streamed response." `
                    -Data @{ provider = $currentProvider; model = $currentModel }
            }

            return $result

        } catch {
            $lastError = $_
            Write-Warning "[AI] Error on attempt $attempt`: $($_.Exception.Message)"
            Write-AIHandlerLog -Level "warn" -Message "AI request failed." -Data @{
                provider = $currentProvider
                model = $currentModel
                attempt = $attempt
                error = $_.Exception.Message
            }

            # Update error tracking
            Update-UsageTracking -Provider $currentProvider -Model $currentModel -IsError $true

            # Determine if we should retry or fallback
            $errorType = Get-ErrorType $_.Exception

            if ($errorType -eq "RateLimit" -or $errorType -eq "Overloaded") {
                # Wait and retry same model, or fallback
                if ($AutoFallback -or $config.settings.autoFallback) {
                    $fallback = Get-FallbackModel -CurrentProvider $currentProvider -CurrentModel $currentModel -CrossProvider
                    if ($fallback) {
                        $currentProvider = $fallback.provider
                        $currentModel = $fallback.model
                        Write-Host "[AI] Falling back to $currentProvider/$currentModel" -ForegroundColor Yellow
                        continue
                    }
                }
                Start-Sleep -Milliseconds ($retryDelay * $attempt)

            } elseif ($errorType -eq "ServerError") {
                # Server error - try fallback provider
                if ($AutoFallback -or $config.settings.autoFallback) {
                    $fallback = Get-FallbackModel -CurrentProvider $currentProvider -CurrentModel $currentModel -CrossProvider
                    if ($fallback) {
                        $currentProvider = $fallback.provider
                        $currentModel = $fallback.model
                        continue
                    }
                }
                Start-Sleep -Milliseconds ($retryDelay * $attempt)

            } elseif ($errorType -eq "AuthError") {
                # Auth error - try different provider immediately
                if ($AutoFallback -or $config.settings.autoFallback) {
                    $fallback = Get-FallbackModel -CurrentProvider $currentProvider -CurrentModel $currentModel -CrossProvider
                    if ($fallback) {
                        $currentProvider = $fallback.provider
                        $currentModel = $fallback.model
                        continue
                    }
                }
                throw "Uwierzytelnienie nieudane dla $currentProvider i brak dostępnego fallbacku."

            } else {
                # Unknown error - standard retry
                Start-Sleep -Milliseconds ($retryDelay * $attempt)
            }
        }
    }

    throw "Wszystkie próby nieudane. Ostatni błąd: $lastError"
}

function Get-ErrorType {
    param($Exception)

    $message = $Exception.Message.ToLower()

    if ($message -match "rate.?limit|429|too many requests") {
        return "RateLimit"
    } elseif ($message -match "overloaded|503|capacity") {
        return "Overloaded"
    } elseif ($message -match "401|403|unauthorized|forbidden|invalid.*key") {
        return "AuthError"
    } elseif ($message -match "500|502|504|server error") {
        return "ServerError"
    } else {
        return "Unknown"
    }
}

function Invoke-ProviderAPI {
    [CmdletBinding()]
    param(
        [string]$Provider,
        [string]$Model,
        [array]$Messages,
        [int]$MaxTokens,
        [float]$Temperature,
        [switch]$Stream,
        [array]$Tools
    )

    $config = Get-AIConfig
    $providerConfig = $config.providers[$Provider]

    switch ($Provider) {
        "anthropic" {
            return Invoke-AnthropicAPI -Model $Model -Messages $Messages `
                -MaxTokens $MaxTokens -Temperature $Temperature -Stream:$Stream
        }
        "openai" {
            return Invoke-OpenAIAPI -Model $Model -Messages $Messages `
                -MaxTokens $MaxTokens -Temperature $Temperature -Stream:$Stream
        }
        "google" {
            return Invoke-GoogleAPI -Model $Model -Messages $Messages `
                -MaxTokens $MaxTokens -Temperature $Temperature -Stream:$Stream `
                -Tools $Tools
        }
        "mistral" {
            return Invoke-MistralAPI -Model $Model -Messages $Messages `
                -MaxTokens $MaxTokens -Temperature $Temperature -Stream:$Stream
        }
        "groq" {
            return Invoke-GroqAPI -Model $Model -Messages $Messages `
                -MaxTokens $MaxTokens -Temperature $Temperature -Stream:$Stream
        }
        "ollama" {
            return Invoke-OllamaAPI -Model $Model -Messages $Messages `
                -MaxTokens $MaxTokens -Temperature $Temperature -Stream:$Stream
        }
        default {
            throw "Nieznany provider: $Provider"
        }
    }
}

function Invoke-StreamingRequest {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Uri,
        [Parameter(Mandatory)]
        [string]$Body,
        [hashtable]$Headers = @{},
        [Parameter(Mandatory)]
        [scriptblock]$OnData
    )

    $client = New-Object System.Net.Http.HttpClient
    $request = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, $Uri)
    foreach ($header in $Headers.Keys) {
        $request.Headers.TryAddWithoutValidation($header, $Headers[$header]) | Out-Null
    }
    $request.Content = New-Object System.Net.Http.StringContent($Body, [System.Text.Encoding]::UTF8, "application/json")

    $response = $client.SendAsync($request, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).Result
    $stream = $response.Content.ReadAsStreamAsync().Result
    $reader = New-Object System.IO.StreamReader($stream)

    while (-not $reader.EndOfStream) {
        $line = $reader.ReadLine()
        if (-not $line) { continue }
        & $OnData $line
    }
}

function Invoke-AnthropicAPI {
    param(
        [string]$Model,
        [array]$Messages,
        [int]$MaxTokens,
        [float]$Temperature,
        [switch]$Stream
    )

    $apiKey = $env:ANTHROPIC_API_KEY
    if (-not $apiKey) {
        throw "Brak zmiennej ANTHROPIC_API_KEY w środowisku."
    }

    # Convert messages to Anthropic format
    $systemMessage = ($Messages | Where-Object { $_.role -eq "system" } | Select-Object -First 1).content
    $chatMessages = $Messages | Where-Object { $_.role -ne "system" } | ForEach-Object {
        @{ role = $_.role; content = $_.content }
    }

    $body = @{
        model = $Model
        max_tokens = $MaxTokens
        temperature = $Temperature
        messages = @($chatMessages)
    }

    if ($systemMessage) {
        $body.system = $systemMessage
    }

    $headers = @{
        "x-api-key" = $apiKey
        "anthropic-version" = "2023-06-01"
        "content-type" = "application/json"
    }

    if ($Stream) {
        $contentBuffer = ""
        Invoke-StreamingRequest -Uri "https://api.anthropic.com/v1/messages" `
            -Headers $headers -Body ($body | ConvertTo-Json -Depth 10) -OnData {
                param($line)
                if ($line -notmatch "^data:") { return }
                $payload = $line -replace "^data:\s*", ""
                if ($payload -eq "[DONE]") { return }
                try {
                    $json = $payload | ConvertFrom-Json
                    if ($json.delta -and $json.delta.text) {
                        $contentBuffer += $json.delta.text
                        Write-Host $json.delta.text -NoNewline
                    } elseif ($json.content_block -and $json.content_block.text) {
                        $contentBuffer += $json.content_block.text
                        Write-Host $json.content_block.text -NoNewline
                    } elseif ($json.message -and $json.message.content) {
                        $text = $json.message.content | Select-Object -First 1
                        if ($text.text) {
                            $contentBuffer += $text.text
                            Write-Host $text.text -NoNewline
                        }
                    }
                } catch { }
            }
        Write-Host ""
        return @{
            content = $contentBuffer
            usage = @{ input_tokens = 0; output_tokens = 0 }
            model = $Model
            stop_reason = "stream"
        }
    }

    $response = Invoke-RestMethod -Uri "https://api.anthropic.com/v1/messages" `
        -Method Post -Headers $headers -Body ($body | ConvertTo-Json -Depth 10)

    return @{
        content = $response.content[0].text
        usage = @{
            input_tokens = $response.usage.input_tokens
            output_tokens = $response.usage.output_tokens
        }
        model = $response.model
        stop_reason = $response.stop_reason
    }
}

function Invoke-OpenAIAPI {
    param(
        [string]$Model,
        [array]$Messages,
        [int]$MaxTokens,
        [float]$Temperature,
        [switch]$Stream
    )

    $apiKey = $env:OPENAI_API_KEY
    if (-not $apiKey) {
        throw "Brak zmiennej OPENAI_API_KEY w środowisku."
    }

    $body = @{
        model = $Model
        max_tokens = $MaxTokens
        temperature = $Temperature
        messages = @($Messages | ForEach-Object {
            @{ role = $_.role; content = $_.content }
        })
    }

    $headers = @{
        "Authorization" = "Bearer $apiKey"
        "Content-Type" = "application/json"
    }

    if ($Stream) {
        return Invoke-OpenAICompatibleStream -Uri "https://api.openai.com/v1/chat/completions" `
            -Headers $headers -Body ($body | ConvertTo-Json -Depth 10) -Model $Model
    }

    $response = Invoke-RestMethod -Uri "https://api.openai.com/v1/chat/completions" `
        -Method Post -Headers $headers -Body ($body | ConvertTo-Json -Depth 10)

    return @{
        content = $response.choices[0].message.content
        usage = @{
            input_tokens = $response.usage.prompt_tokens
            output_tokens = $response.usage.completion_tokens
        }
        model = $response.model
        stop_reason = $response.choices[0].finish_reason
    }
}

function Invoke-OpenAICompatibleStream {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Uri,
        [Parameter(Mandatory)]
        [hashtable]$Headers,
        [Parameter(Mandatory)]
        [string]$Body,
        [string]$Model
    )

    $streamBody = ($Body | ConvertFrom-Json)
    $streamBody.stream = $true
    $contentBuffer = ""

    Invoke-StreamingRequest -Uri $Uri -Headers $Headers -Body ($streamBody | ConvertTo-Json -Depth 10) -OnData {
        param($line)
        if ($line -notmatch "^data:") { return }
        $payload = $line -replace "^data:\s*", ""
        if ($payload -eq "[DONE]") { return }
        try {
            $json = $payload | ConvertFrom-Json
            $delta = $json.choices[0].delta.content
            if ($delta) {
                $contentBuffer += $delta
                Write-Host $delta -NoNewline
            }
        } catch { }
    }

    Write-Host ""
    return @{
        content = $contentBuffer
        usage = @{ input_tokens = 0; output_tokens = 0 }
        model = $Model
        stop_reason = "stream"
    }
}

function Invoke-GoogleAPI {
    param(
        [string]$Model,
        [array]$Messages,
        [int]$MaxTokens,
        [float]$Temperature,
        [switch]$Stream
    )

    $apiKey = $env:GOOGLE_API_KEY
    if (-not $apiKey) {
        throw "Brak zmiennej GOOGLE_API_KEY w środowisku."
    }

    $systemMessage = ($Messages | Where-Object { $_.role -eq "system" } | Select-Object -First 1).content
    $contents = @($Messages | Where-Object { $_.role -ne "system" } | ForEach-Object {
        @{ role = $_.role; parts = @(@{ text = $_.content }) }
    })

    $body = @{
        contents = $contents
        generationConfig = @{
            maxOutputTokens = $MaxTokens
            temperature = $Temperature
        }
    }

    if ($systemMessage) {
        $body.systemInstruction = @{ parts = @(@{ text = $systemMessage }) }
    }

    $uri = "https://generativelanguage.googleapis.com/v1beta/models/$Model`:generateContent?key=$apiKey"
    $response = Invoke-RestMethod -Uri $uri -Method Post -Body ($body | ConvertTo-Json -Depth 10) `
        -ContentType "application/json"

    $text = $response.candidates[0].content.parts[0].text
    return @{
        content = $text
        usage = @{
            input_tokens = $response.usageMetadata.promptTokenCount
            output_tokens = $response.usageMetadata.candidatesTokenCount
        }
        model = $Model
        stop_reason = $response.candidates[0].finishReason
    }
}

function Invoke-MistralAPI {
    param(
        [string]$Model,
        [array]$Messages,
        [int]$MaxTokens,
        [float]$Temperature,
        [switch]$Stream
    )

    $apiKey = $env:MISTRAL_API_KEY
    if (-not $apiKey) {
        throw "Brak zmiennej MISTRAL_API_KEY w środowisku."
    }

    $body = @{
        model = $Model
        max_tokens = $MaxTokens
        temperature = $Temperature
        messages = @($Messages | ForEach-Object { @{ role = $_.role; content = $_.content } })
    }

    $headers = @{
        "Authorization" = "Bearer $apiKey"
        "Content-Type" = "application/json"
    }

    if ($Stream) {
        return Invoke-OpenAICompatibleStream -Uri "https://api.mistral.ai/v1/chat/completions" `
            -Headers $headers -Body ($body | ConvertTo-Json -Depth 10) -Model $Model
    }

    $response = Invoke-RestMethod -Uri "https://api.mistral.ai/v1/chat/completions" `
        -Method Post -Headers $headers -Body ($body | ConvertTo-Json -Depth 10)

    return @{
        content = $response.choices[0].message.content
        usage = @{
            input_tokens = $response.usage.prompt_tokens
            output_tokens = $response.usage.completion_tokens
        }
        model = $response.model
        stop_reason = $response.choices[0].finish_reason
    }
}

function Invoke-GroqAPI {
    param(
        [string]$Model,
        [array]$Messages,
        [int]$MaxTokens,
        [float]$Temperature,
        [switch]$Stream
    )

    $apiKey = $env:GROQ_API_KEY
    if (-not $apiKey) {
        throw "Brak zmiennej GROQ_API_KEY w środowisku."
    }

    $body = @{
        model = $Model
        max_tokens = $MaxTokens
        temperature = $Temperature
        messages = @($Messages | ForEach-Object { @{ role = $_.role; content = $_.content } })
    }

    $headers = @{
        "Authorization" = "Bearer $apiKey"
        "Content-Type" = "application/json"
    }

    if ($Stream) {
        return Invoke-OpenAICompatibleStream -Uri "https://api.groq.com/openai/v1/chat/completions" `
            -Headers $headers -Body ($body | ConvertTo-Json -Depth 10) -Model $Model
    }

    $response = Invoke-RestMethod -Uri "https://api.groq.com/openai/v1/chat/completions" `
        -Method Post -Headers $headers -Body ($body | ConvertTo-Json -Depth 10)

    return @{
        content = $response.choices[0].message.content
        usage = @{
            input_tokens = $response.usage.prompt_tokens
            output_tokens = $response.usage.completion_tokens
        }
        model = $response.model
        stop_reason = $response.choices[0].finish_reason
    }
}

function Test-OllamaAvailable {
    try {
        $request = [System.Net.WebRequest]::Create("http://localhost:11434/api/tags")
        $request.Method = "GET"
        $request.Timeout = 3000
        $response = $request.GetResponse()
        $response.Close()
        return $true
    } catch {
        return $false
    }
}

function Install-OllamaAuto {
    <#
    .SYNOPSIS
        Auto-install Ollama in silent mode
    #>
    [CmdletBinding()]
    param(
        [switch]$Force,
        [string]$DefaultModel = "llama3.2:3b"
    )

    $installerScript = Join-Path $PSScriptRoot "Install-Ollama.ps1"

    if (Test-Path $installerScript) {
        Write-Host "[AI] Auto-installing Ollama..." -ForegroundColor Yellow
        & $installerScript -SkipModelPull
        return Test-OllamaAvailable
    } else {
        # Inline minimal installer
        Write-Host "[AI] Downloading and installing Ollama (silent)..." -ForegroundColor Yellow

        $tempInstaller = Join-Path $env:TEMP "OllamaSetup.exe"
        $downloadUrl = "https://ollama.com/download/OllamaSetup.exe"

        try {
            $ProgressPreference = "SilentlyContinue"
            Invoke-WebRequest -Uri $downloadUrl -OutFile $tempInstaller -UseBasicParsing

            $process = Start-Process -FilePath $tempInstaller `
                -ArgumentList "/SP- /VERYSILENT /NORESTART /SUPPRESSMSGBOXES" `
                -Wait -PassThru

            if ($process.ExitCode -eq 0) {
                Write-Host "[AI] Ollama installed successfully" -ForegroundColor Green

                # Start service
                $ollamaExe = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
                if (Test-Path $ollamaExe) {
                    Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
                    Start-Sleep -Seconds 5
                }

                Remove-Item $tempInstaller -Force -ErrorAction SilentlyContinue
                return Test-OllamaAvailable
            }
        } catch {
            Write-Warning "[AI] Ollama auto-install failed: $($_.Exception.Message)"
        }

        return $false
    }
}

function Invoke-OllamaAPI {
    param(
        [string]$Model,
        [array]$Messages,
        [int]$MaxTokens,
        [float]$Temperature,
        [switch]$Stream
    )

    # Check if Ollama is running, try to start or install if not
    if (-not (Test-OllamaAvailable)) {
        Write-Host "[AI] Ollama nie działa, próba uruchomienia..." -ForegroundColor Yellow

        # Try to start existing installation
        $ollamaExe = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
        if (Test-Path $ollamaExe) {
            Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
            Start-Sleep -Seconds 3

            if (-not (Test-OllamaAvailable)) {
                throw "Ollama installed but failed to start"
            }
        } else {
            # Offer to auto-install
            $config = Get-AIConfig
            if ($config.settings.autoInstallOllama) {
                if (Install-OllamaAuto) {
                    Write-Host "[AI] Ollama auto-installed and running" -ForegroundColor Green
                } else {
                    throw "Ollama auto-installation failed"
                }
            } else {
                throw "Ollama not installed. Run Install-Ollama.ps1 or set autoInstallOllama=true"
            }
        }
    }

    $body = @{
        model = $Model
        messages = @($Messages | ForEach-Object {
            @{ role = $_.role; content = $_.content }
        })
        options = @{
            num_predict = $MaxTokens
            temperature = $Temperature
        }
        stream = $Stream.IsPresent
    }

    try {
        if ($Stream) {
            $contentBuffer = ""
            Invoke-StreamingRequest -Uri "http://localhost:11434/api/chat" `
                -Headers @{ "Content-Type" = "application/json" } -Body ($body | ConvertTo-Json -Depth 10) -OnData {
                    param($line)
                    try {
                        $json = $line | ConvertFrom-Json
                        if ($json.message -and $json.message.content) {
                            $contentBuffer += $json.message.content
                            Write-Host $json.message.content -NoNewline
                        }
                    } catch { }
                }
            Write-Host ""
            return @{
                content = $contentBuffer
                usage = @{ input_tokens = 0; output_tokens = 0 }
                model = $Model
                stop_reason = "stream"
            }
        }

        $response = Invoke-RestMethod -Uri "http://localhost:11434/api/chat" `
            -Method Post -Body ($body | ConvertTo-Json -Depth 10) -ContentType "application/json"

        return @{
            content = $response.message.content
            usage = @{
                input_tokens = $response.prompt_eval_count
                output_tokens = $response.eval_count
            }
            model = $response.model
            stop_reason = "stop"
        }
    } catch {
        throw "Ollama API error: $_"
    }
}

#endregion

#region Utility Functions

function Get-AIStatus {
    <#
    .SYNOPSIS
        Gets current AI system status including all providers and rate limits
    #>
    [CmdletBinding()]
    param()

    $config = Get-AIConfig
    $state = Get-AIState

    Write-Host "`n=== AI Model Handler Status ===" -ForegroundColor Cyan

    foreach ($providerName in $config.providerFallbackOrder) {
        $provider = $config.providers[$providerName]
        $hasKey = -not $provider.apiKeyEnv -or [Environment]::GetEnvironmentVariable($provider.apiKeyEnv)
        $keyStatus = if ($hasKey) { "[OK]" } else { "[NO KEY]" }
        $enabledStatus = if ($provider.enabled) { "Enabled" } else { "Disabled" }

        $color = if ($hasKey -and $provider.enabled) { "Green" } else { "Yellow" }
        Write-Host "`n[$providerName] $keyStatus $enabledStatus" -ForegroundColor $color

        foreach ($modelName in $provider.models.Keys) {
            $model = $provider.models[$modelName]
            $rateStatus = Get-RateLimitStatus -Provider $providerName -Model $modelName
            $usage = $state.usage[$providerName][$modelName]

            $statusIcon = if ($rateStatus.available) { "+" } else { "!" }
            $tierLabel = $model.tier.ToUpper().PadRight(8)

            Write-Host "  $statusIcon $modelName" -ForegroundColor White -NoNewline
            Write-Host " [$tierLabel] " -ForegroundColor Gray -NoNewline
            Write-Host "Tokens: $($rateStatus.tokensPercent)% " -NoNewline -ForegroundColor $(if ($rateStatus.tokensPercent -gt 85) { "Red" } else { "Green" })
            Write-Host "Reqs: $($rateStatus.requestsPercent)%" -ForegroundColor $(if ($rateStatus.requestsPercent -gt 85) { "Red" } else { "Green" })

            if ($usage -and $usage.totalCost -gt 0) {
                Write-Host "    Total: $($usage.totalRequests) requests, `$$([math]::Round($usage.totalCost, 4))" -ForegroundColor Gray
            }
        }
    }

    Write-Host "`n=== Settings ===" -ForegroundColor Cyan
    Write-Host "  Auto Fallback: $($config.settings.autoFallback)" -ForegroundColor Gray
    Write-Host "  Cost Optimization: $($config.settings.costOptimization)" -ForegroundColor Gray
    Write-Host "  Rate Limit Threshold: $($config.settings.rateLimitThreshold * 100)%" -ForegroundColor Gray
    Write-Host "  Max Retries: $($config.settings.maxRetries)" -ForegroundColor Gray
}

function Get-AIHealth {
    <#
    .SYNOPSIS
        Returns a health dashboard snapshot with status, tokens, and cost.
    #>
    [CmdletBinding()]
    param()

    $config = Get-AIConfig
    $state = Get-AIState
    $providers = @()

    foreach ($providerName in $config.providerFallbackOrder) {
        $provider = $config.providers[$providerName]
        $hasKey = -not $provider.apiKeyEnv -or [Environment]::GetEnvironmentVariable($provider.apiKeyEnv)

        $models = @()
        foreach ($modelName in $provider.models.Keys) {
            $usage = $state.usage[$providerName][$modelName]
            $rate = Get-RateLimitStatus -Provider $providerName -Model $modelName
            $models += @{
                name = $modelName
                tier = $provider.models[$modelName].tier
                status = if ($rate.available) { "ok" } else { "limited" }
                tokens = @{
                    percent = $rate.tokensPercent
                    remaining = $rate.tokensRemaining
                }
                requests = @{
                    percent = $rate.requestsPercent
                    remaining = $rate.requestsRemaining
                }
                usage = @{
                    totalRequests = $usage.totalRequests
                    totalTokens = $usage.totalTokens
                    totalCost = [math]::Round($usage.totalCost, 4)
                }
            }
        }

        $providers += @{
            name = $providerName
            enabled = $provider.enabled
            hasKey = $hasKey
            models = $models
        }
    }

    return @{
        timestamp = (Get-Date).ToString("o")
        providers = $providers
    }
}

function Reset-AIState {
    <#
    .SYNOPSIS
        Resets all usage tracking and error counts
    #>
    [CmdletBinding()]
    param([switch]$Force)

    if (-not $Force) {
        $confirm = Read-Host "Reset all AI usage data? (y/N)"
        if ($confirm -ne "y") {
            Write-Host "Cancelled" -ForegroundColor Yellow
            return
        }
    }

    $script:RuntimeState = @{
        currentProvider = "anthropic"
        currentModel = "claude-sonnet-4-5-20250929"
        usage = @{}
        errors = @()
        lastRequest = $null
    }

    Initialize-AIState
    Write-Host "[AI] State reset complete" -ForegroundColor Green
}

function Test-AIProviders {
    <#
    .SYNOPSIS
        Tests connectivity to all configured providers
    #>
    [CmdletBinding()]
    param()

    $config = Get-AIConfig
    $results = @()

    Write-Host "`nTesting AI Providers..." -ForegroundColor Cyan

    foreach ($providerName in $config.providerFallbackOrder) {
        $provider = $config.providers[$providerName]

        Write-Host "`n[$providerName] " -NoNewline

        if (-not $provider.enabled) {
            Write-Host "DISABLED" -ForegroundColor Gray
            $results += @{ provider = $providerName; status = "disabled" }
            continue
        }

        # Check API key
        if ($provider.apiKeyEnv) {
            $key = [Environment]::GetEnvironmentVariable($provider.apiKeyEnv)
            if (-not $key) {
                Write-Host "NO API KEY ($($provider.apiKeyEnv))" -ForegroundColor Red
                $results += @{ provider = $providerName; status = "no_key" }
                continue
            }
        }

        # Test connectivity
        try {
            $testMessages = @(
                @{ role = "user"; content = "Say 'OK' and nothing else." }
            )

            $firstModel = $config.fallbackChain[$providerName][0]
            $response = Invoke-ProviderAPI -Provider $providerName -Model $firstModel `
                -Messages $testMessages -MaxTokens 10 -Temperature 0

            Write-Host "OK " -ForegroundColor Green -NoNewline
            Write-Host "($firstModel responded)" -ForegroundColor Gray
            $results += @{ provider = $providerName; status = "ok"; model = $firstModel }

        } catch {
            Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
            $results += @{ provider = $providerName; status = "error"; error = $_.Exception.Message }
        }
    }

    return $results
}

#endregion

#region Parallel Execution

function Invoke-AIRequestParallel {
    <#
    .SYNOPSIS
        Execute multiple AI requests in parallel using runspaces
    .DESCRIPTION
        Runs multiple AI requests concurrently, optimal for local Ollama execution.
        Uses PowerShell runspaces for true multi-threaded execution.
    .PARAMETER Requests
        Array of request objects with: Messages, Provider, Model, MaxTokens, Temperature
    .PARAMETER MaxConcurrent
        Maximum concurrent requests (default: from config or 4)
    .PARAMETER TimeoutMs
        Timeout per request in milliseconds (default: 30000)
    .EXAMPLE
        $requests = @(
            @{ Messages = @(@{role="user";content="Task 1"}); Model = "llama3.2:3b" },
            @{ Messages = @(@{role="user";content="Task 2"}); Model = "llama3.2:3b" }
        )
        $results = Invoke-AIRequestParallel -Requests $requests
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [array]$Requests,

        [int]$MaxConcurrent,

        [int]$TimeoutMs
    )

    $config = Get-AIConfig
    $parallelConfig = $config.settings.parallelExecution

    if (-not $MaxConcurrent) {
        $MaxConcurrent = if ($parallelConfig.maxConcurrent) { $parallelConfig.maxConcurrent } else { 4 }
    }
    if (-not $TimeoutMs) {
        $TimeoutMs = if ($parallelConfig.timeoutMs) { $parallelConfig.timeoutMs } else { 30000 }
    }

    Write-Host "[AI] Executing $($Requests.Count) requests in parallel (max: $MaxConcurrent)..." -ForegroundColor Cyan

    # Create InitialSessionState with module pre-loaded
    $modulePath = Join-Path $PSScriptRoot "AIModelHandler.psm1"
    $iss = [System.Management.Automation.Runspaces.InitialSessionState]::CreateDefault()
    $iss.ImportPSModule($modulePath)

    # Create runspace pool with pre-loaded module
    $runspacePool = [runspacefactory]::CreateRunspacePool(1, $MaxConcurrent, $iss, $Host)
    $runspacePool.Open()

    $jobs = @()
    $results = @()

    foreach ($i in 0..($Requests.Count - 1)) {
        $request = $Requests[$i]

        $powershell = [powershell]::Create()
        $powershell.RunspacePool = $runspacePool

        [void]$powershell.AddScript({
            param($Request, $Index)

            try {
                $params = @{
                    Messages = $Request.Messages
                    MaxTokens = if ($Request.MaxTokens) { $Request.MaxTokens } else { 1024 }
                    Temperature = if ($Request.Temperature) { $Request.Temperature } else { 0.7 }
                }

                if ($Request.Provider) { $params.Provider = $Request.Provider }
                if ($Request.Model) { $params.Model = $Request.Model }

                $response = Invoke-AIRequest @params

                return @{
                    Index = $Index
                    Success = $true
                    Response = $response
                    Error = $null
                }
            } catch {
                return @{
                    Index = $Index
                    Success = $false
                    Response = $null
                    Error = $_.Exception.Message
                }
            }
        })

        [void]$powershell.AddArgument($request)
        [void]$powershell.AddArgument($i)

        $jobs += @{
            PowerShell = $powershell
            Handle = $powershell.BeginInvoke()
            Index = $i
        }
    }

    # Collect results with timeout
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

    foreach ($job in $jobs) {
        $remainingTime = $TimeoutMs - $stopwatch.ElapsedMilliseconds
        if ($remainingTime -lt 0) { $remainingTime = 0 }

        try {
            if ($job.Handle.AsyncWaitHandle.WaitOne($remainingTime)) {
                $result = $job.PowerShell.EndInvoke($job.Handle)
                $results += $result
            } else {
                $results += @{
                    Index = $job.Index
                    Success = $false
                    Response = $null
                    Error = "Timeout after ${TimeoutMs}ms"
                }
            }
        } catch {
            $results += @{
                Index = $job.Index
                Success = $false
                Response = $null
                Error = $_.Exception.Message
            }
        } finally {
            $job.PowerShell.Dispose()
        }
    }

    $runspacePool.Close()
    $runspacePool.Dispose()

    # Sort by original index
    $results = $results | Sort-Object { $_.Index }

    $successCount = ($results | Where-Object { $_.Success }).Count
    Write-Host "[AI] Completed: $successCount/$($Requests.Count) successful in $($stopwatch.ElapsedMilliseconds)ms" -ForegroundColor $(if ($successCount -eq $Requests.Count) { "Green" } else { "Yellow" })

    return $results
}

function Invoke-AIBatch {
    <#
    .SYNOPSIS
        Process a batch of prompts with the same settings
    .DESCRIPTION
        Simplified interface for batch processing multiple prompts.
        Automatically uses local Ollama if available and configured.
    .PARAMETER Prompts
        Array of prompt strings
    .PARAMETER SystemPrompt
        Optional system prompt applied to all requests
    .PARAMETER Model
        Model to use (default: from config)
    .PARAMETER MaxConcurrent
        Max concurrent requests
    .EXAMPLE
        $prompts = @("Summarize X", "Translate Y", "Explain Z")
        $results = Invoke-AIBatch -Prompts $prompts -Model "llama3.2:3b"
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string[]]$Prompts,

        [string]$SystemPrompt,

        [string]$Model,

        [string]$Provider,

        [int]$MaxTokens = 1024,

        [int]$MaxConcurrent
    )

    $config = Get-AIConfig

    # Auto-select provider based on config
    if (-not $Provider) {
        if ($config.settings.preferLocal -and (Test-OllamaAvailable)) {
            $Provider = "ollama"
            if (-not $Model) {
                $Model = $config.settings.ollamaDefaultModel
            }
        } else {
            $Provider = $config.providerFallbackOrder[0]
            if (-not $Model) {
                $Model = $config.fallbackChain[$Provider][0]
            }
        }
    }

    Write-Host "[AI] Batch processing $($Prompts.Count) prompts with $Provider/$Model" -ForegroundColor Cyan

    # Build requests
    $requests = @()
    foreach ($prompt in $Prompts) {
        $messages = @()
        if ($SystemPrompt) {
            $messages += @{ role = "system"; content = $SystemPrompt }
        }
        $messages += @{ role = "user"; content = $prompt }

        $requests += @{
            Messages = $messages
            Provider = $Provider
            Model = $Model
            MaxTokens = $MaxTokens
        }
    }

    # Execute in parallel
    $results = Invoke-AIRequestParallel -Requests $requests -MaxConcurrent $MaxConcurrent

    # Simplify output
    return $results | ForEach-Object {
        @{
            Prompt = $Prompts[$_.Index]
            Success = $_.Success
            Content = if ($_.Success) { $_.Response.content } else { $null }
            Error = $_.Error
            Tokens = if ($_.Success) { $_.Response.usage } else { $null }
        }
    }
}

function Get-LocalModels {
    <#
    .SYNOPSIS
        Get list of available local Ollama models
    #>
    [CmdletBinding()]
    param()

    if (-not (Test-OllamaAvailable)) {
        Write-Warning "Ollama is not running"
        return @()
    }

    try {
        $response = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get
        return $response.models | ForEach-Object {
            @{
                Name = $_.name
                Size = [math]::Round($_.size / 1GB, 2)
                Modified = $_.modified_at
            }
        }
    } catch {
        return @()
    }
}

#endregion

#region Model Discovery Integration

function Sync-AIModels {
    <#
    .SYNOPSIS
        Synchronize available models from all providers
    .DESCRIPTION
        Fetches current model list from Anthropic, OpenAI, Google, Mistral, Groq, and Ollama APIs
        Updates config with discovered models
    .PARAMETER Force
        Force refresh, bypass cache
    .PARAMETER UpdateConfig
        Write discovered models to ai-config.json
    .PARAMETER Silent
        Suppress output
    #>
    [CmdletBinding()]
    param(
        [switch]$Force,
        [switch]$UpdateConfig,
        [switch]$Silent
    )

    if (-not (Get-Command 'Get-AllAvailableModels' -ErrorAction SilentlyContinue)) {
        Import-SubModule -Name "ModelDiscovery" -Path $script:ModelDiscoveryPath | Out-Null
    }
    if (-not (Get-Command 'Get-AllAvailableModels' -ErrorAction SilentlyContinue)) {
        Write-Warning "ModelDiscovery module not loaded"
        return $null
    }

    if (-not $Silent) {
        Write-Host "[AI] Synchronizing models from providers..." -ForegroundColor Cyan
    }

    $config = Get-AIConfig
    $script:DiscoveredModels = Get-AllAvailableModels -Force:$Force `
        -Parallel:$config.settings.modelDiscovery.parallel `
        -SkipValidation:$config.settings.modelDiscovery.skipValidation

    if (-not $Silent) {
        foreach ($p in $script:DiscoveredModels.Summary.GetEnumerator()) {
            $icon = if ($p.Value.Success) { "+" } else { "-" }
            $color = if ($p.Value.Success) { "Green" } else { "Yellow" }
            Write-Host "  [$icon] $($p.Key): $($p.Value.ModelCount) models" -ForegroundColor $color
        }
        Write-Host "  Total: $($script:DiscoveredModels.TotalModels) models in $($script:DiscoveredModels.FetchDurationMs)ms" -ForegroundColor Gray
    }

    if ($UpdateConfig) {
        Update-ModelConfig | Out-Null
        if (-not $Silent) {
            Write-Host "[AI] Config updated with discovered models" -ForegroundColor Green
        }
    }

    return $script:DiscoveredModels
}

function Get-DiscoveredModels {
    <#
    .SYNOPSIS
        Get cached discovered models
    .PARAMETER Provider
        Filter by provider
    .PARAMETER Refresh
        Force refresh from APIs
    #>
    [CmdletBinding()]
    param(
        [ValidateSet("anthropic", "openai", "ollama", "all")]
        [string]$Provider = "all",
        [switch]$Refresh
    )

    if ($Refresh -or -not $script:DiscoveredModels) {
        $script:DiscoveredModels = Sync-AIModels -Silent
    }

    if (-not $script:DiscoveredModels) {
        return @()
    }

    $models = $script:DiscoveredModels.Models

    if ($Provider -ne "all") {
        $models = $models | Where-Object { $_.provider -eq $Provider }
    }

    return $models
}

function Get-ModelInfo {
    <#
    .SYNOPSIS
        Get detailed info about a specific model
    .PARAMETER ModelId
        Model ID (e.g., "gpt-4o", "claude-sonnet-4-20250514", "llama3.2:3b")
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$ModelId
    )

    $models = Get-DiscoveredModels

    $model = $models | Where-Object { $_.id -eq $ModelId } | Select-Object -First 1

    if (-not $model) {
        # Try partial match
        $model = $models | Where-Object { $_.id -like "*$ModelId*" } | Select-Object -First 1
    }

    return $model
}

#endregion

#region Provider/Model Selection

function Set-AIProvider {
    <#
    .SYNOPSIS
        Sets the active AI provider
    .DESCRIPTION
        Allows switching between Anthropic, OpenAI, Google, Mistral, Groq, and Ollama providers
    .PARAMETER Provider
        Provider name: anthropic, openai, google, mistral, groq, ollama
    .PARAMETER Interactive
        Show interactive menu to select provider
    .EXAMPLE
        Set-AIProvider -Provider anthropic
        Set-AIProvider -Interactive
    #>
    [CmdletBinding()]
    param(
        [ValidateSet("anthropic", "openai", "google", "mistral", "groq", "ollama")]
        [string]$Provider,

        [switch]$Interactive
    )

    $config = Get-AIConfig
    $state = Get-AIState

    if ($Interactive) {
        Write-Host "`n=== Select AI Provider ===" -ForegroundColor Cyan
        Write-Host ""

        $providers = @(
            @{ Name = "anthropic"; Display = "Anthropic (Claude)"; KeyEnv = "ANTHROPIC_API_KEY" }
            @{ Name = "openai";    Display = "OpenAI (GPT)";       KeyEnv = "OPENAI_API_KEY" }
            @{ Name = "google";    Display = "Google (Gemini)";    KeyEnv = "GOOGLE_API_KEY" }
            @{ Name = "mistral";   Display = "Mistral AI";         KeyEnv = "MISTRAL_API_KEY" }
            @{ Name = "groq";      Display = "Groq (Fast)";        KeyEnv = "GROQ_API_KEY" }
            @{ Name = "ollama";    Display = "Ollama (Local)";     KeyEnv = $null }
        )

        $i = 1
        foreach ($p in $providers) {
            $hasKey = if ($p.KeyEnv) { [bool][Environment]::GetEnvironmentVariable($p.KeyEnv) } else { Test-OllamaAvailable }
            $status = if ($hasKey) { "[OK]" } else { "[--]" }
            $color = if ($hasKey) { "Green" } else { "DarkGray" }
            $current = if ($state.currentProvider -eq $p.Name) { " <-- current" } else { "" }

            Write-Host "  [$i] " -NoNewline -ForegroundColor White
            Write-Host "$status " -NoNewline -ForegroundColor $color
            Write-Host "$($p.Display)$current" -ForegroundColor $(if ($hasKey) { "White" } else { "DarkGray" })
            $i++
        }

        Write-Host ""
        $choice = Read-Host "Select provider (1-6)"

        if ($choice -match "^[1-6]$") {
            $Provider = $providers[[int]$choice - 1].Name
        } else {
            Write-Host "Cancelled" -ForegroundColor Yellow
            return
        }
    }

    if (-not $Provider) {
        Write-Warning "No provider specified. Use -Provider or -Interactive"
        return
    }

    # Validate provider has API key (except ollama)
    $providerConfig = $config.providers[$Provider]
    if ($providerConfig.apiKeyEnv) {
        $key = [Environment]::GetEnvironmentVariable($providerConfig.apiKeyEnv)
        if (-not $key) {
            Write-Warning "Provider '$Provider' requires $($providerConfig.apiKeyEnv) environment variable"
            return
        }
    } elseif ($Provider -eq "ollama") {
        if (-not (Test-OllamaAvailable)) {
            Write-Warning "Ollama is not running. Start Ollama first."
            return
        }
    }

    # Set the provider
    $state.currentProvider = $Provider

    # Auto-select first model from fallback chain
    $chain = $config.fallbackChain[$Provider]
    if ($chain -and $chain.Count -gt 0) {
        $state.currentModel = $chain[0]
    }

    $script:RuntimeState = $state
    Save-AIState $state

    Write-Host "[AI] Provider set to: " -NoNewline -ForegroundColor Green
    Write-Host "$Provider " -NoNewline -ForegroundColor Cyan
    Write-Host "(model: $($state.currentModel))" -ForegroundColor Gray
}

function Set-AIModel {
    <#
    .SYNOPSIS
        Sets the active AI model for the current provider
    .DESCRIPTION
        Allows selecting a specific model within the current or specified provider
    .PARAMETER Model
        Model identifier (e.g., claude-sonnet-4-5-20250929, gpt-4o, llama3.2:3b)
    .PARAMETER Provider
        Optional provider to set along with model
    .PARAMETER Interactive
        Show interactive menu to select model
    .EXAMPLE
        Set-AIModel -Model "claude-sonnet-4-5-20250929"
        Set-AIModel -Model "gpt-4o" -Provider openai
        Set-AIModel -Interactive
    #>
    [CmdletBinding()]
    param(
        [string]$Model,

        [ValidateSet("anthropic", "openai", "google", "mistral", "groq", "ollama")]
        [string]$Provider,

        [switch]$Interactive
    )

    $config = Get-AIConfig
    $state = Get-AIState

    if ($Interactive) {
        # First select provider if not specified
        if (-not $Provider) {
            $Provider = $state.currentProvider
        }

        Write-Host "`n=== Select Model for $Provider ===" -ForegroundColor Cyan
        Write-Host ""

        $models = @()

        # Get models from config
        $providerModels = $config.providers[$Provider].models
        if ($providerModels) {
            foreach ($modelName in $providerModels.Keys) {
                $modelInfo = $providerModels[$modelName]
                $models += @{
                    Name = $modelName
                    Tier = $modelInfo.tier
                    Context = $modelInfo.contextWindow
                    Cost = $modelInfo.inputCost
                }
            }
        }

        # For Ollama, also get local models
        if ($Provider -eq "ollama" -and (Test-OllamaAvailable)) {
            $localModels = Get-LocalModels
            foreach ($lm in $localModels) {
                if ($models.Name -notcontains $lm.Name) {
                    $models += @{
                        Name = $lm.Name
                        Tier = "local"
                        Context = 32000
                        Cost = 0
                    }
                }
            }
        }

        if ($models.Count -eq 0) {
            Write-Warning "No models available for $Provider"
            return
        }

        $i = 1
        foreach ($m in $models) {
            $tierLabel = "[$($m.Tier.ToUpper().PadRight(8))]"
            $costLabel = if ($m.Cost -eq 0) { "FREE" } else { "`$$($m.Cost)/1M" }
            $current = if ($state.currentModel -eq $m.Name) { " <-- current" } else { "" }

            Write-Host "  [$i] " -NoNewline -ForegroundColor White
            Write-Host "$tierLabel " -NoNewline -ForegroundColor $(
                switch ($m.Tier) {
                    "pro" { "Magenta" }
                    "standard" { "Cyan" }
                    "lite" { "Green" }
                    default { "Gray" }
                }
            )
            Write-Host "$($m.Name) " -NoNewline -ForegroundColor White
            Write-Host "($costLabel)$current" -ForegroundColor DarkGray
            $i++
        }

        Write-Host ""
        $choice = Read-Host "Select model (1-$($models.Count))"

        if ($choice -match "^\d+$" -and [int]$choice -ge 1 -and [int]$choice -le $models.Count) {
            $Model = $models[[int]$choice - 1].Name
        } else {
            Write-Host "Cancelled" -ForegroundColor Yellow
            return
        }
    }

    if (-not $Model) {
        Write-Warning "No model specified. Use -Model or -Interactive"
        return
    }

    # If provider specified, set it too
    if ($Provider) {
        $state.currentProvider = $Provider
    }

    $state.currentModel = $Model
    $script:RuntimeState = $state
    Save-AIState $state

    Write-Host "[AI] Model set to: " -NoNewline -ForegroundColor Green
    Write-Host "$($state.currentProvider)/" -NoNewline -ForegroundColor Gray
    Write-Host "$Model" -ForegroundColor Cyan
}

function Show-AIConfig {
    <#
    .SYNOPSIS
        Shows current AI configuration with provider and model selection menu
    .DESCRIPTION
        Interactive display of current settings with options to change provider/model
    #>
    [CmdletBinding()]
    param()

    $config = Get-AIConfig
    $state = Get-AIState

    Write-Host ""
    Write-Host "  +------------------------------------------+" -ForegroundColor Cyan
    Write-Host "  |         HYDRA AI CONFIGURATION          |" -ForegroundColor Cyan
    Write-Host "  +------------------------------------------+" -ForegroundColor Cyan
    Write-Host ""

    # Current settings
    Write-Host "  Current Provider: " -NoNewline -ForegroundColor Gray
    Write-Host $state.currentProvider -ForegroundColor Cyan

    Write-Host "  Current Model:    " -NoNewline -ForegroundColor Gray
    Write-Host $state.currentModel -ForegroundColor Yellow

    Write-Host ""
    Write-Host "  +------------------------------------------+" -ForegroundColor DarkGray

    # Provider status
    Write-Host ""
    Write-Host "  Available Providers:" -ForegroundColor White
    foreach ($providerName in $config.providerFallbackOrder) {
        $provider = $config.providers[$providerName]
        $hasKey = if ($provider.apiKeyEnv) {
            [bool][Environment]::GetEnvironmentVariable($provider.apiKeyEnv)
        } else {
            $providerName -eq "ollama" -and (Test-OllamaAvailable)
        }

        $icon = if ($hasKey) { "[+]" } else { "[-]" }
        $color = if ($hasKey) { "Green" } else { "DarkGray" }
        $current = if ($state.currentProvider -eq $providerName) { " <--" } else { "" }

        Write-Host "    $icon $($providerName.PadRight(12)) " -NoNewline -ForegroundColor $color
        Write-Host "$current" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "  +------------------------------------------+" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Commands:" -ForegroundColor White
    Write-Host "    Set-AIProvider -Interactive  " -NoNewline -ForegroundColor Cyan
    Write-Host "# Change provider" -ForegroundColor DarkGray
    Write-Host "    Set-AIModel -Interactive     " -NoNewline -ForegroundColor Cyan
    Write-Host "# Change model" -ForegroundColor DarkGray
    Write-Host "    Get-AIStatus                 " -NoNewline -ForegroundColor Cyan
    Write-Host "# Full status" -ForegroundColor DarkGray
    Write-Host ""
}

function Switch-ToOllama {
    <#
    .SYNOPSIS
        Quick switch to local Ollama provider
    .PARAMETER Model
        Ollama model to use (default: llama3.2:3b)
    #>
    [CmdletBinding()]
    param(
        [string]$Model = "llama3.2:3b"
    )

    if (-not (Test-OllamaAvailable)) {
        Write-Warning "Ollama is not running. Attempting to start..."
        $ollamaExe = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
        if (Test-Path $ollamaExe) {
            Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
            Start-Sleep -Seconds 3
            if (-not (Test-OllamaAvailable)) {
                Write-Error "Failed to start Ollama"
                return
            }
        } else {
            Write-Error "Ollama not installed. Run Install-OllamaAuto"
            return
        }
    }

    Set-AIProvider -Provider "ollama"
    Set-AIModel -Model $Model -Provider "ollama"
}

function Switch-ToAnthropic {
    <#
    .SYNOPSIS
        Quick switch to Anthropic Claude
    .PARAMETER Model
        Claude model (default: claude-sonnet-4-5-20250929)
    #>
    [CmdletBinding()]
    param(
        [string]$Model = "claude-sonnet-4-5-20250929"
    )

    if (-not $env:ANTHROPIC_API_KEY) {
        Write-Error "ANTHROPIC_API_KEY environment variable not set"
        return
    }

    Set-AIProvider -Provider "anthropic"
    Set-AIModel -Model $Model -Provider "anthropic"
}

function Switch-ToOpenAI {
    <#
    .SYNOPSIS
        Quick switch to OpenAI GPT
    .PARAMETER Model
        GPT model (default: gpt-4o)
    #>
    [CmdletBinding()]
    param(
        [string]$Model = "gpt-4o"
    )

    if (-not $env:OPENAI_API_KEY) {
        Write-Error "OPENAI_API_KEY environment variable not set"
        return
    }

    Set-AIProvider -Provider "openai"
    Set-AIModel -Model $Model -Provider "openai"
}

#endregion

#region Exports

Export-ModuleMember -Function @(
    'Get-AIConfig',
    'Save-AIConfig',
    'Initialize-AIState',
    'Get-OptimalModel',
    'Get-FallbackModel',
    'Get-RateLimitStatus',
    'Update-UsageTracking',
    'Invoke-AIRequest',
    'Invoke-AIRequestParallel',
    'Invoke-AIBatch',
    'Get-LocalModels',
    'Get-AIStatus',
    'Get-AIHealth',
    'Reset-AIState',
    'Test-AIProviders',
    'Test-OllamaAvailable',
    'Install-OllamaAuto',
    # Model Discovery
    'Sync-AIModels',
    'Get-DiscoveredModels',
    'Get-ModelInfo',
    # Provider/Model Selection
    'Set-AIProvider',
    'Set-AIModel',
    'Show-AIConfig',
    'Switch-ToOllama',
    'Switch-ToAnthropic',
    'Switch-ToOpenAI',
    # Dynamic Model Aliases
    'Resolve-ModelAlias',
    'Resolve-GeminiAlias',
    'Update-ModelAliases',
    'Get-ResolvedModel',
    # Fallback System (NEW)
    'Get-FallbackAlias',
    'Test-AliasAvailability',
    'Get-ModelForTask',
    # YOLO, Deep & Turbo Mode Settings
    'Get-YoloSettings',
    'Get-DeepModeSettings',
    'Get-TurboSettings',
    'Get-AIState'
)

#endregion

# Auto-initialize on module load (fast - no network calls)
Initialize-AIState | Out-Null

# LAZY LOADING: Model discovery and alias resolution are deferred until first use
# This dramatically improves module load time
# Call Sync-AIModels or Update-ModelAliases manually if immediate sync is needed
$script:LazyInitDone = $false

function Invoke-LazyInit {
    <#
    .SYNOPSIS
        Performs deferred initialization on first use (lazy loading)
    .DESCRIPTION
        Called automatically when models or aliases are first accessed.
        Avoids blocking module load with network calls.
    #>
    if ($script:LazyInitDone) { return }
    $script:LazyInitDone = $true

    # Skip if no API keys available
    $hasKeys = $env:ANTHROPIC_API_KEY -or $env:OPENAI_API_KEY -or $env:GOOGLE_API_KEY -or $env:GEMINI_API_KEY
    $hasOllama = $false
    try { $hasOllama = Test-OllamaAvailable -ErrorAction SilentlyContinue } catch {}

    if (-not $hasKeys -and -not $hasOllama) { return }

    try {
        Import-SubModule -Name "ModelDiscovery" -Path $script:ModelDiscoveryPath | Out-Null
        # Background model discovery (non-blocking)
        $script:DiscoveredModels = Sync-AIModels -Silent -ErrorAction SilentlyContinue
    } catch {
        # Silently fail
    }
}
