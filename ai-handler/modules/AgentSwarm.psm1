#Requires -Version 5.1
<#
.SYNOPSIS
    HYDRA Agent Swarm v3.0 - Unified Module with Parallel Execution
.DESCRIPTION
    Scalony moduł zawierający:
    - 6-etapowy protokół Agent Swarm (12 Witcher Agents)
    - Smart Queue z RunspacePool dla równoległości
    - Intelligent routing (local Ollama vs cloud)

    Architektura AI:
    - Spekulacja/Planowanie/Synteza: Google Cloud (gemini-pro/flash)
    - Egzekucja tasków: Ollama (lokalnie) - równolegle przez RunspacePool
.VERSION
    3.0.0
.AUTHOR
    HYDRA System
#>

#region IMPORTS & PATHS

$script:ModulePath = Split-Path -Parent $PSScriptRoot
$script:ClassifierPath = Join-Path $PSScriptRoot "TaskClassifier.psm1"
$script:AIHandlerPath = Join-Path $script:ModulePath "AIModelHandler.psm1"

if (Test-Path $script:ClassifierPath) { Import-Module $script:ClassifierPath -Force }
if (Test-Path $script:AIHandlerPath) { Import-Module $script:AIHandlerPath -Force }

#endregion

#region CONFIGURATION

# Swarm Configuration
$script:SwarmConfig = @{
    MemoryDir = Join-Path $PSScriptRoot "..\..\.serena\memories"
    # Model aliases - resolved dynamically at runtime via Resolve-ModelAlias
    DefaultPlannerModel = "gemini-pro-planning"       # -> latest gemini pro
    DefaultSpeculatorModel = "gemini-flash-fast"      # -> latest gemini flash
    DefaultDispatcherModel = "gemini-flash-fast"      # -> latest gemini flash
    DefaultExecutorProvider = "ollama"
}

# Queue Configuration
$script:QueueConfig = @{
    MaxConcurrentLocal = 2      # Max parallel Ollama requests
    MaxConcurrentCloud = 4      # Max parallel cloud requests
    MaxConcurrentTotal = 5      # Total max parallel
    QueuePersistPath = Join-Path $script:ModulePath "queue\smart-queue.json"
    ResultsPath = Join-Path $script:ModulePath "queue\results"
    DefaultTimeout = 120000     # 2 minutes per request
    RetryAttempts = 2
    EnableParallel = $true
}

# 12 Witcher Agents - Model Mapping
$script:AgentModels = @{
    "Ciri"     = "llama3.2:1b"           # Najszybszy - proste zadania
    "Regis"    = "phi3:mini"             # Analityczny - głęboka analiza
    "Yennefer" = "qwen2.5-coder:1.5b"    # Kod - architektura
    "Triss"    = "qwen2.5-coder:1.5b"    # Kod - testy
    "Lambert"  = "qwen2.5-coder:1.5b"    # Kod - debug
    "Philippa" = "qwen2.5-coder:1.5b"    # Kod - integracje
    "Geralt"   = "llama3.2:3b"           # Ogólne - security
    "Jaskier"  = "llama3.2:3b"           # Ogólne - docs
    "Vesemir"  = "llama3.2:3b"           # Ogólne - review
    "Eskel"    = "llama3.2:3b"           # Ogólne - devops
    "Zoltan"   = "llama3.2:3b"           # Ogólne - data
    "Dijkstra" = "llama3.2:3b"           # Ogólne - strategy
}

#endregion

#region STATE MANAGEMENT

# Queue State
$script:Queue = [System.Collections.Concurrent.ConcurrentQueue[hashtable]]::new()
$script:ActiveJobs = [System.Collections.Concurrent.ConcurrentDictionary[string,hashtable]]::new()
$script:CompletedResults = [System.Collections.ArrayList]::new()
$script:QueueStats = @{
    TotalQueued = 0
    TotalCompleted = 0
    TotalFailed = 0
    LocalExecutions = 0
    CloudExecutions = 0
    StartTime = $null
}

#endregion

#region UTILITY FUNCTIONS

function Invoke-ResilientCall {
    <#
    .SYNOPSIS
        Resilient AI call with automatic failover between providers
    #>
    param(
        [string]$Provider,
        [string]$Model,
        [array]$Messages,
        [int]$MaxTokens = 4096,
        [double]$Temperature = 0.7,
        [array]$Tools,
        [string]$Label = "AI",
        [bool]$FallbackToOllama = $true
    )

    $isOnline = Test-Connection -ComputerName 8.8.8.8 -Count 1 -Quiet -ErrorAction SilentlyContinue
    $providers = @($Provider, "anthropic", "openai", "ollama") | Select-Object -Unique

    foreach ($p in $providers) {
        try {
            if ($p -ne "ollama" -and -not $isOnline) { continue }

            # Dynamic Model Mapping
            $tryModel = $Model
            if ($p -ne $Provider) {
                $tryModel = switch ($p) {
                    "anthropic" { "claude-3-5-sonnet-latest" }
                    "openai"    { "gpt-4o" }
                    "ollama"    { "llama3.2:3b" }
                    default     { $Model }
                }
            }

            # Resolve alias if Resolve-ModelAlias is available (loaded from AIModelHandler)
            if (Get-Command Resolve-ModelAlias -ErrorAction SilentlyContinue) {
                $tryModel = Resolve-ModelAlias -Alias $tryModel
            }

            Write-Host "[$Label] Trying $p/$tryModel..." -ForegroundColor DarkGray

            $params = @{
                Messages = $Messages
                Provider = $p
                Model = $tryModel
                MaxTokens = $MaxTokens
                Temperature = $Temperature
                AutoFallback = $false
                NoOptimize = $true
            }
            if ($Tools -and $p -eq "google") { $params.Tools = $Tools }

            return Invoke-AIRequest @params
        } catch {
            Write-Warning "[$Label] $p failed: $($_.Exception.Message)"
        }
    }
    throw "All providers failed for $Label"
}

function Get-AgentMemory {
    <#
    .SYNOPSIS
        Retrieves agent's memory from markdown file
    #>
    param([string]$Name)

    $memDir = $script:SwarmConfig.MemoryDir
    if (-not (Test-Path $memDir)) { New-Item -ItemType Directory -Path $memDir -Force | Out-Null }

    $path = Join-Path $memDir "$Name.md"
    if (Test-Path $path) { return Get-Content $path -Raw }
    return "I am $Name. I am learning."
}

function Save-AgentMemory {
    <#
    .SYNOPSIS
        Saves agent's memory and occasionally rebases it
    #>
    param(
        [string]$Name,
        [string]$Content
    )

    $memDir = $script:SwarmConfig.MemoryDir
    if (-not (Test-Path $memDir)) { New-Item -ItemType Directory -Path $memDir -Force | Out-Null }

    $path = Join-Path $memDir "$Name.md"
    Add-Content -Path $path -Value "`n$(Get-Date -Format 'yyyy-MM-dd HH:mm'): $Content"

    # Rebase/Merge Chance (10%)
    if ((Get-Random -Minimum 0 -Maximum 10) -eq 0) {
        Write-Host " [$Name] Rebasing memory..." -ForegroundColor DarkGray
        try {
            $history = Get-Content $path -Raw
            $summaryPrompt = "Summarize this agent memory, keeping key skills and past successes, merging duplicates:`n$history"
            $summary = Invoke-AIRequest -Provider "ollama" -Model "llama3.2:3b" -Messages @(@{role="user"; content=$summaryPrompt}) -NoOptimize
            Set-Content -Path $path -Value "REBASED $(Get-Date): $($summary.content)"
        } catch { }
    }
}

function Get-AgentModel {
    <#
    .SYNOPSIS
        Returns the appropriate Ollama model for a given agent
    #>
    param([string]$AgentName)

    if ($script:AgentModels.ContainsKey($AgentName)) {
        return $script:AgentModels[$AgentName]
    }
    return "llama3.2:3b"  # Default fallback
}

#endregion

#region PROMPT OPTIMIZATION

function Optimize-PromptAuto {
    <#
    .SYNOPSIS
        Automatically improves prompts using fast AI model
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Prompt,

        [switch]$UseAI,
        [string]$FastModel = 'llama3.2:1b'
    )

    $improved = $Prompt.Trim()
    $enhancements = @()

    # Rule-based improvements
    if ($improved -notmatch '\?$' -and $improved.Length -lt 50) {
        $improved = "$improved. Be concise."
        $enhancements += "conciseness"
    }

    if ($improved -match '(write|create|implement|code|function|script)' -and
        $improved -notmatch 'format|markdown|code block') {
        $improved = "$improved Use proper code formatting with comments."
        $enhancements += "code-format"
    }

    if ($improved -match '(explain|what is|how does|why)' -and
        $improved -notmatch 'example') {
        $improved = "$improved Include a brief example."
        $enhancements += "example"
    }

    if ($improved -match '(compare|difference|vs|versus)') {
        $improved = "$improved Present as a comparison table."
        $enhancements += "table"
    }

    if ($improved -match '\b(python|javascript|typescript|rust|go|powershell|bash|sql|csharp)\b') {
        $lang = $Matches[1]
        $improved = "[$lang] $improved"
        $enhancements += "lang-tag"
    }

    # AI-powered improvement (optional)
    if ($UseAI) {
        try {
            $ollamaOnline = $false
            try {
                $tcp = New-Object System.Net.Sockets.TcpClient
                $tcp.Connect('localhost', 11434)
                $ollamaOnline = $tcp.Connected
                $tcp.Close()
            } catch { }

            if ($ollamaOnline) {
                $aiPrompt = "Improve this prompt for better AI response. Return ONLY the improved prompt (max 2 sentences):`n$Prompt"
                $body = @{
                    model = $FastModel
                    prompt = $aiPrompt
                    stream = $false
                    options = @{ num_predict = 100 }
                } | ConvertTo-Json

                $response = Invoke-RestMethod -Uri 'http://localhost:11434/api/generate' `
                    -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 10

                if ($response.response -and $response.response.Length -gt 10) {
                    $improved = $response.response.Trim()
                    $enhancements += "AI-enhanced"
                }
            }
        } catch { }
    }

    return @{
        Original = $Prompt
        Optimized = $improved
        Enhancements = $enhancements
        Changed = $Prompt -ne $improved
    }
}

function Get-PromptComplexity {
    <#
    .SYNOPSIS
        Analyzes prompt complexity for smart routing
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Prompt
    )

    $wordCount = ($Prompt -split '\s+').Count
    $hasCode = $Prompt -match '(function|class|def |import |require|const |let |var |\{|\})'
    $hasMultiStep = $Prompt -match '(first|then|after|finally|step|1\.|2\.|3\.)'
    $hasAnalysis = $Prompt -match '(analyze|compare|explain|review|debug|optimize)'

    $score = 0
    $score += [math]::Min($wordCount / 10, 5)
    if ($hasCode) { $score += 3 }
    if ($hasMultiStep) { $score += 2 }
    if ($hasAnalysis) { $score += 2 }

    $complexity = switch ($score) {
        { $_ -le 3 }  { 'simple' }
        { $_ -le 6 }  { 'medium' }
        { $_ -le 9 }  { 'complex' }
        default       { 'advanced' }
    }

    return @{
        Complexity = $complexity
        Score = [math]::Round($score, 1)
        WordCount = $wordCount
        HasCode = $hasCode
        HasMultiStep = $hasMultiStep
        RecommendedModel = switch ($complexity) {
            'simple'   { 'llama3.2:1b' }
            'medium'   { 'llama3.2:3b' }
            'complex'  { 'qwen2.5-coder:1.5b' }
            'advanced' { 'phi3:mini' }
        }
    }
}

#endregion

#region QUEUE MANAGEMENT

function Add-ToSmartQueue {
    <#
    .SYNOPSIS
        Adds prompt to smart queue with AI classification
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [string]$Prompt,

        [ValidateSet("high", "normal", "low", 1, 2, 3)]
        $Priority = "normal",

        [string]$Tag = "default",

        [scriptblock]$Callback,

        [switch]$SkipClassification
    )

    process {
        $id = [guid]::NewGuid().ToString().Substring(0, 8)

        $priorityInt = switch ($Priority) {
            "high" { 1 }
            "normal" { 2 }
            "low" { 3 }
            1 { 1 }
            2 { 2 }
            3 { 3 }
            default { 0 }
        }

        $classification = $null
        if (-not $SkipClassification -and (Get-Command Invoke-TaskClassification -ErrorAction SilentlyContinue)) {
            Write-Host "[Queue] Classifying prompt $id..." -ForegroundColor Cyan
            $classification = Invoke-TaskClassification -Prompt $Prompt -ForQueue -PreferLocal
        }

        $item = @{
            Id = $id
            Prompt = $Prompt
            Priority = if ($priorityInt -gt 0) { $priorityInt }
                      elseif ($classification -and $classification.QueuePriority) { $classification.QueuePriority }
                      else { 2 }
            Classification = $classification
            Tag = $Tag
            Callback = $Callback
            Status = "queued"
            QueuedAt = Get-Date
            Attempts = 0
            Result = $null
            Error = $null
        }

        $script:Queue.Enqueue($item)
        $script:QueueStats.TotalQueued++

        $tierLabel = if ($classification) { $classification.Tier } else { "unknown" }
        $localLabel = if ($classification -and $classification.LocalSuitable) { "LOCAL" } else { "CLOUD" }

        Write-Host "[Queue] Added #$id | Priority: $($item.Priority) | Tier: $tierLabel | Target: $localLabel" -ForegroundColor Green

        return $id
    }
}

function Add-BatchToSmartQueue {
    <#
    .SYNOPSIS
        Adds multiple prompts to queue efficiently
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string[]]$Prompts,

        [string]$Tag = "batch",

        [switch]$ClassifyInParallel
    )

    $batchId = [guid]::NewGuid().ToString().Substring(0, 8)
    $ids = @()

    Write-Host "[Queue] Adding batch of $($Prompts.Count) prompts (batch: $batchId)..." -ForegroundColor Cyan

    if ($ClassifyInParallel -and $Prompts.Count -gt 1) {
        $classified = Invoke-ParallelClassification -Prompts $Prompts

        for ($i = 0; $i -lt $Prompts.Count; $i++) {
            $item = @{
                Id = "$batchId-$i"
                Prompt = $Prompts[$i]
                Priority = $classified[$i].QueuePriority
                Classification = $classified[$i]
                Tag = $Tag
                BatchId = $batchId
                Status = "queued"
                QueuedAt = Get-Date
                Attempts = 0
            }
            $script:Queue.Enqueue($item)
            $ids += $item.Id
        }
    } else {
        foreach ($prompt in $Prompts) {
            $id = Add-ToSmartQueue -Prompt $prompt -Tag $Tag
            $ids += $id
        }
    }

    $script:QueueStats.TotalQueued += $Prompts.Count
    Write-Host "[Queue] Batch $batchId added: $($ids.Count) items" -ForegroundColor Green

    return @{
        BatchId = $batchId
        ItemIds = $ids
        Count = $ids.Count
    }
}

function Get-QueueStatus {
    <#
    .SYNOPSIS
        Returns current queue status
    #>
    [CmdletBinding()]
    param()

    $pending = $script:Queue.Count
    $active = $script:ActiveJobs.Count
    $completed = $script:CompletedResults.Count

    return @{
        Pending = $pending
        Active = $active
        Completed = $completed
        Failed = $script:QueueStats.TotalFailed
        TotalQueued = $script:QueueStats.TotalQueued
        LocalExecutions = $script:QueueStats.LocalExecutions
        CloudExecutions = $script:QueueStats.CloudExecutions
        ActiveJobs = $script:ActiveJobs.Keys | ForEach-Object { $script:ActiveJobs[$_].Id }
    }
}

function Get-SmartQueueStatus {
    <#
    .SYNOPSIS
        Alias for Get-QueueStatus
    #>
    [CmdletBinding()]
    param()
    Get-QueueStatus
}

function Clear-QueueResults {
    <#
    .SYNOPSIS
        Clears completed results
    #>
    [CmdletBinding()]
    param()

    $count = $script:CompletedResults.Count
    $script:CompletedResults.Clear()
    $script:QueueStats = @{
        TotalQueued = 0; TotalCompleted = 0; TotalFailed = 0
        LocalExecutions = 0; CloudExecutions = 0; StartTime = $null
    }
    Write-Host "[Queue] Cleared $count results" -ForegroundColor Yellow
}

function Clear-SmartQueue {
    <#
    .SYNOPSIS
        Clears all items from the queue and resets state
    #>
    [CmdletBinding()]
    param()

    while ($script:Queue.TryDequeue([ref]$null)) { }
    $script:ActiveJobs.Clear()
    Clear-QueueResults

    Write-Host "[Queue] Queue cleared and reset" -ForegroundColor Yellow
}

function Get-QueueResults {
    <#
    .SYNOPSIS
        Returns completed results with optional filtering
    #>
    [CmdletBinding()]
    param(
        [string]$Tag,
        [string]$BatchId,
        [switch]$SuccessOnly,
        [switch]$FailedOnly
    )

    $results = $script:CompletedResults

    if ($Tag) { $results = $results | Where-Object { $_.Tag -eq $Tag } }
    if ($BatchId) { $results = $results | Where-Object { $_.BatchId -eq $BatchId } }
    if ($SuccessOnly) { $results = $results | Where-Object { $_.Status -eq "completed" } }
    if ($FailedOnly) { $results = $results | Where-Object { $_.Status -eq "failed" } }

    return $results
}

#endregion

#region PARALLEL EXECUTION ENGINE

function Start-QueueProcessor {
    <#
    .SYNOPSIS
        Starts processing queue with parallel execution
    #>
    [CmdletBinding()]
    param(
        [int]$MaxParallel = $script:QueueConfig.MaxConcurrentTotal,
        [switch]$WaitForCompletion,
        [hashtable]$CurrentPrompt
    )

    if ($script:Queue.Count -eq 0 -and -not $CurrentPrompt) {
        Write-Host "[Queue] Queue is empty" -ForegroundColor Yellow
        return
    }

    $script:QueueStats.StartTime = Get-Date
    Write-Host "[Queue] Starting processor (max parallel: $MaxParallel)..." -ForegroundColor Cyan

    $connStatus = Get-ConnectionStatus
    Write-Host "[Queue] Mode: $($connStatus.Mode) | Ollama: $($connStatus.OllamaAvailable) | Internet: $($connStatus.InternetAvailable)" -ForegroundColor Gray

    if ($CurrentPrompt) {
        $currentItem = @{
            Id = "current-" + [guid]::NewGuid().ToString().Substring(0, 4)
            Prompt = $CurrentPrompt.Prompt
            Priority = 0
            Classification = $CurrentPrompt.Classification
            Status = "queued"
            QueuedAt = Get-Date
            IsCurrent = $true
        }

        $tempItems = @($currentItem)
        while ($script:Queue.TryDequeue([ref]$null)) {
            $item = $null
            if ($script:Queue.TryDequeue([ref]$item)) {
                $tempItems += $item
            }
        }
        foreach ($item in $tempItems) {
            $script:Queue.Enqueue($item)
        }
    }

    $iss = [System.Management.Automation.Runspaces.InitialSessionState]::CreateDefault()
    $runspacePool = [runspacefactory]::CreateRunspacePool(1, $MaxParallel)
    $runspacePool.Open()

    $jobs = @{}
    $localCount = 0
    $cloudCount = 0

    try {
        while ($script:Queue.Count -gt 0 -or $jobs.Count -gt 0) {

            while ($jobs.Count -lt $MaxParallel -and $script:Queue.Count -gt 0) {
                $item = $null
                if (-not $script:Queue.TryDequeue([ref]$item)) { break }

                $execModel = $null
                if ($item.Classification) {
                    $execModel = Get-OptimalExecutionModel -Classification $item.Classification -PreferLocal
                }

                if (-not $execModel) {
                    $localModel = Get-AvailableLocalModel
                    if ($localModel) {
                        $execModel = @{ Provider = "ollama"; Model = $localModel; IsLocal = $true }
                    } elseif ($connStatus.InternetAvailable) {
                        $execModel = @{ Provider = "anthropic"; Model = "claude-3-5-haiku-20241022"; IsLocal = $false }
                    }
                }

                if (-not $execModel) {
                    Write-Warning "[Queue] No model available for item $($item.Id)"
                    $item.Status = "failed"
                    $item.Error = "No model available"
                    $script:QueueStats.TotalFailed++
                    continue
                }

                if ($execModel.IsLocal) {
                    if ($localCount -ge $script:QueueConfig.MaxConcurrentLocal) {
                        $script:Queue.Enqueue($item)
                        Start-Sleep -Milliseconds 100
                        continue
                    }
                    $localCount++
                } else {
                    if ($cloudCount -ge $script:QueueConfig.MaxConcurrentCloud) {
                        $script:Queue.Enqueue($item)
                        Start-Sleep -Milliseconds 100
                        continue
                    }
                    $cloudCount++
                }

                $item.Status = "running"
                $item.StartedAt = Get-Date
                $item.ExecutionModel = $execModel
                $script:ActiveJobs[$item.Id] = $item

                $providerLabel = if ($execModel.IsLocal) { "LOCAL" } else { "CLOUD" }
                Write-Host "[Queue] Starting #$($item.Id) on $providerLabel $($execModel.Provider)/$($execModel.Model)" -ForegroundColor $(if ($execModel.IsLocal) { "Green" } else { "Cyan" })

                $ps = [powershell]::Create()
                $ps.RunspacePool = $runspacePool

                $scriptBlock = {
                    param($ModulePath, $Provider, $Model, $Prompt, $MaxTokens)

                    Import-Module $ModulePath -Force

                    $messages = @(@{ role = "user"; content = $Prompt })

                    try {
                        $response = Invoke-AIRequest `
                            -Provider $Provider `
                            -Model $Model `
                            -Messages $messages `
                            -MaxTokens $MaxTokens `
                            -NoOptimize `
                            -ErrorAction Stop

                        return @{
                            Success = $true
                            Content = $response.content
                            Usage = $response.usage
                            Provider = $Provider
                            Model = $Model
                        }
                    } catch {
                        return @{
                            Success = $false
                            Error = $_.Exception.Message
                            Provider = $Provider
                            Model = $Model
                        }
                    }
                }

                [void]$ps.AddScript($scriptBlock)
                [void]$ps.AddParameter("ModulePath", $script:AIHandlerPath)
                [void]$ps.AddParameter("Provider", $execModel.Provider)
                [void]$ps.AddParameter("Model", $execModel.Model)
                [void]$ps.AddParameter("Prompt", $item.Prompt)
                [void]$ps.AddParameter("MaxTokens", 4096)

                $handle = $ps.BeginInvoke()

                $jobs[$item.Id] = @{
                    PowerShell = $ps
                    Handle = $handle
                    Item = $item
                    IsLocal = $execModel.IsLocal
                }
            }

            $completedIds = @()
            foreach ($jobId in $jobs.Keys) {
                $job = $jobs[$jobId]
                if ($job.Handle.IsCompleted) {
                    $completedIds += $jobId

                    try {
                        $result = $job.PowerShell.EndInvoke($job.Handle)
                        $item = $job.Item
                        $item.CompletedAt = Get-Date
                        $item.Duration = ($item.CompletedAt - $item.StartedAt).TotalSeconds

                        if ($result -and $result.Success) {
                            $item.Status = "completed"
                            $item.Result = $result.Content
                            $item.Usage = $result.Usage
                            $script:QueueStats.TotalCompleted++

                            if ($job.IsLocal) {
                                $script:QueueStats.LocalExecutions++
                            } else {
                                $script:QueueStats.CloudExecutions++
                            }

                            Write-Host "[Queue] Completed #$($item.Id) in $([math]::Round($item.Duration, 1))s" -ForegroundColor Green

                            if ($item.Callback) {
                                try {
                                    & $item.Callback $item
                                } catch {
                                    Write-Warning "[Queue] Callback error: $($_.Exception.Message)"
                                }
                            }
                        } else {
                            $item.Status = "failed"
                            $item.Error = $result.Error
                            $script:QueueStats.TotalFailed++
                            Write-Warning "[Queue] Failed #$($item.Id): $($result.Error)"
                        }

                        [void]$script:CompletedResults.Add($item)

                    } catch {
                        $item.Status = "failed"
                        $item.Error = $_.Exception.Message
                        $script:QueueStats.TotalFailed++
                    } finally {
                        $job.PowerShell.Dispose()
                        [void]$script:ActiveJobs.TryRemove($jobId, [ref]$null)

                        if ($job.IsLocal) { $localCount-- } else { $cloudCount-- }
                    }
                }
            }

            foreach ($id in $completedIds) {
                $jobs.Remove($id)
            }

            if ($jobs.Count -gt 0 -or $script:Queue.Count -gt 0) {
                Start-Sleep -Milliseconds 50
            }
        }

    } finally {
        $runspacePool.Close()
        $runspacePool.Dispose()
    }

    $elapsed = ((Get-Date) - $script:QueueStats.StartTime).TotalSeconds
    Write-Host "`n[Queue] Processing complete!" -ForegroundColor Cyan
    Write-Host "  Total: $($script:QueueStats.TotalCompleted) completed, $($script:QueueStats.TotalFailed) failed" -ForegroundColor White
    Write-Host "  Local: $($script:QueueStats.LocalExecutions) | Cloud: $($script:QueueStats.CloudExecutions)" -ForegroundColor Gray
    Write-Host "  Time: $([math]::Round($elapsed, 1))s" -ForegroundColor Gray

    return $script:CompletedResults
}

function Invoke-ParallelClassification {
    <#
    .SYNOPSIS
        Classifies multiple prompts in parallel
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string[]]$Prompts,

        [int]$MaxParallel = 4
    )

    Write-Host "[Queue] Classifying $($Prompts.Count) prompts in parallel..." -ForegroundColor Cyan

    $results = [System.Collections.ArrayList]::new()

    $iss = [System.Management.Automation.Runspaces.InitialSessionState]::CreateDefault()
    $runspacePool = [runspacefactory]::CreateRunspacePool(1, $MaxParallel)
    $runspacePool.Open()

    $jobs = @()

    try {
        foreach ($prompt in $Prompts) {
            $ps = [powershell]::Create()
            $ps.RunspacePool = $runspacePool

            [void]$ps.AddScript({
                param($ClassifierPath, $Prompt)
                Import-Module $ClassifierPath -Force
                Invoke-TaskClassification -Prompt $Prompt -ForQueue -PreferLocal
            })
            [void]$ps.AddParameter("ClassifierPath", $script:ClassifierPath)
            [void]$ps.AddParameter("Prompt", $prompt)

            $jobs += @{
                PowerShell = $ps
                Handle = $ps.BeginInvoke()
                Prompt = $prompt
            }
        }

        foreach ($job in $jobs) {
            try {
                $result = $job.PowerShell.EndInvoke($job.Handle)
                [void]$results.Add($result)
            } catch {
                [void]$results.Add((Get-PatternBasedClassification -Prompt $job.Prompt -ForQueue))
            } finally {
                $job.PowerShell.Dispose()
            }
        }

    } finally {
        $runspacePool.Close()
        $runspacePool.Dispose()
    }

    return $results
}

function Invoke-ParallelSwarmExecution {
    <#
    .SYNOPSIS
        Executes Swarm tasks in parallel using RunspacePool
    .DESCRIPTION
        Dedicated function for parallel execution of Witcher Agent tasks
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [array]$Tasks,

        [string]$DispatcherModel = $script:SwarmConfig.DefaultDispatcherModel,
        [string]$ExecutorProvider = $script:SwarmConfig.DefaultExecutorProvider,
        [int]$MaxParallel = $script:QueueConfig.MaxConcurrentTotal,
        [bool]$IsOnline = $true
    )

    Write-Host " [Parallel] Launching $($Tasks.Count) agents (max $MaxParallel concurrent)..." -ForegroundColor Cyan

    $results = [System.Collections.Concurrent.ConcurrentDictionary[int,string]]::new()

    # Create RunspacePool
    $runspacePool = [runspacefactory]::CreateRunspacePool(1, $MaxParallel)
    $runspacePool.Open()

    $jobs = @{}

    try {
        # PHASE 1: Launch all tasks in parallel
        foreach ($task in $Tasks) {
            $agentName = $task.agent
            $instruction = $task.instruction
            $memory = Get-AgentMemory $agentName

            Write-Host " [$agentName] Dispatching..." -ForegroundColor DarkGray

            # Dispatcher generates system prompt (synchronous - fast)
            $systemPrompt = ""
            if ($IsOnline) {
                try {
                    $dispatchPrompt = "You are the Dispatcher.`n" +
                                      "Target Agent: $agentName (Witcher Persona)`n" +
                                      "Task: $instruction`n" +
                                      "Memory: $memory`n`n" +
                                      "Generate a System Prompt for this agent that includes:`n" +
                                      "1. Their Persona`n" +
                                      "2. GOD MODE authorization`n" +
                                      "3. The specific task instructions.`n" +
                                      "Return ONLY the System Prompt."

                    $dispatchRes = Invoke-ResilientCall -Provider "google" -Model $DispatcherModel `
                        -Messages @(@{role="user"; content=$dispatchPrompt}) -Label "Dispatch-$agentName"
                    $systemPrompt = $dispatchRes.content
                } catch {
                    $systemPrompt = "You are $agentName. GOD MODE: ENABLED. Task: $instruction"
                }
            } else {
                $systemPrompt = "You are $agentName. GOD MODE: ENABLED. Task: $instruction"
            }

            # Get model for this agent
            $execModel = Get-AgentModel $agentName

            # Create PowerShell instance
            $ps = [powershell]::Create()
            $ps.RunspacePool = $runspacePool

            $scriptBlock = {
                param($ModulePath, $Provider, $Model, $SystemPrompt, $TaskId, $AgentName)

                Import-Module $ModulePath -Force

                $messages = @(
                    @{ role = "system"; content = $SystemPrompt }
                    @{ role = "user"; content = "Execute." }
                )

                try {
                    $response = Invoke-AIRequest -Provider $Provider -Model $Model `
                        -Messages $messages -NoOptimize -ErrorAction Stop

                    return @{
                        Success = $true
                        TaskId = $TaskId
                        AgentName = $AgentName
                        Content = $response.content
                    }
                } catch {
                    return @{
                        Success = $false
                        TaskId = $TaskId
                        AgentName = $AgentName
                        Error = $_.Exception.Message
                    }
                }
            }

            [void]$ps.AddScript($scriptBlock)
            [void]$ps.AddParameter("ModulePath", $script:AIHandlerPath)
            [void]$ps.AddParameter("Provider", $ExecutorProvider)
            [void]$ps.AddParameter("Model", $execModel)
            [void]$ps.AddParameter("SystemPrompt", $systemPrompt)
            [void]$ps.AddParameter("TaskId", $task.id)
            [void]$ps.AddParameter("AgentName", $agentName)

            $handle = $ps.BeginInvoke()

            $jobs[$task.id] = @{
                PowerShell = $ps
                Handle = $handle
                Task = $task
                AgentName = $agentName
                Instruction = $instruction
                StartTime = Get-Date
            }
        }

        # PHASE 2: Collect results
        while ($jobs.Count -gt 0) {
            $completedIds = @()

            foreach ($taskId in $jobs.Keys) {
                $job = $jobs[$taskId]

                if ($job.Handle.IsCompleted) {
                    $completedIds += $taskId

                    try {
                        $result = $job.PowerShell.EndInvoke($job.Handle)
                        $duration = ((Get-Date) - $job.StartTime).TotalSeconds

                        if ($result.Success) {
                            $results[$taskId] = "$($result.AgentName): $($result.Content)"
                            Write-Host " [$($result.AgentName)] Complete ($([math]::Round($duration, 1))s)" -ForegroundColor Green
                            Save-AgentMemory $result.AgentName "Task: $($job.Instruction) | Result: Success"
                        } else {
                            $results[$taskId] = "$($result.AgentName) Failed: $($result.Error)"
                            Write-Host " [$($result.AgentName)] Failed ($([math]::Round($duration, 1))s)" -ForegroundColor Red
                            Save-AgentMemory $result.AgentName "Task: $($job.Instruction) | Result: Failed - $($result.Error)"
                        }
                    } catch {
                        $results[$taskId] = "$($job.AgentName) Failed: $($_.Exception.Message)"
                        Write-Host " [$($job.AgentName)] Exception" -ForegroundColor Red
                    } finally {
                        $job.PowerShell.Dispose()
                    }
                }
            }

            foreach ($id in $completedIds) {
                $jobs.Remove($id)
            }

            if ($jobs.Count -gt 0) {
                Start-Sleep -Milliseconds 100
            }
        }

    } finally {
        $runspacePool.Close()
        $runspacePool.Dispose()
    }

    # Convert ConcurrentDictionary to regular hashtable
    $hash = @{}
    $results.Keys | ForEach-Object { $hash[$_] = $results[$_] }

    Write-Host " [Parallel] All $($Tasks.Count) agents completed." -ForegroundColor Cyan

    return $hash
}

#endregion

#region TURBO MODE - 4x Parallel Pipeline

# Pre-warmed agent state for Turbo Mode
$script:TurboAgents = @{
    Pool = $null
    Initialized = $false
    AgentCount = 4
    LastActivity = $null
}

function Initialize-TurboAgents {
    <#
    .SYNOPSIS
        Pre-warms 4 agents for Turbo Mode execution
    .DESCRIPTION
        Creates RunspacePool with 4 slots and pre-loads Ollama models
    #>
    [CmdletBinding()]
    param(
        [int]$AgentCount = 4
    )

    if ($script:TurboAgents.Initialized) {
        Write-Host "[TURBO] Agents already initialized." -ForegroundColor DarkGray
        return $script:TurboAgents
    }

    Write-Host "[TURBO] Initializing $AgentCount parallel agents..." -ForegroundColor Cyan

    # Create dedicated RunspacePool for Turbo
    $script:TurboAgents.Pool = [runspacefactory]::CreateRunspacePool(1, $AgentCount)
    $script:TurboAgents.Pool.Open()
    $script:TurboAgents.AgentCount = $AgentCount
    $script:TurboAgents.Initialized = $true
    $script:TurboAgents.LastActivity = Get-Date

    # Pre-warm Ollama models (keep them in memory)
    $modelsToWarm = @("llama3.2:3b", "llama3.2:1b", "qwen2.5-coder:1.5b")
    foreach ($model in $modelsToWarm) {
        try {
            # Send dummy request to load model into memory
            $warmupBody = @{
                model = $model
                prompt = "Hello"
                stream = $false
                options = @{ num_predict = 1 }
            } | ConvertTo-Json

            $null = Invoke-RestMethod -Uri "http://localhost:11434/api/generate" `
                -Method Post -Body $warmupBody -ContentType "application/json" `
                -TimeoutSec 30 -ErrorAction SilentlyContinue

            Write-Host " [+] $model pre-loaded" -ForegroundColor Green
        } catch {
            Write-Host " [-] $model not available" -ForegroundColor DarkGray
        }
    }

    Write-Host "[TURBO] $AgentCount agents ready!" -ForegroundColor Green
    return $script:TurboAgents
}

function Stop-TurboAgents {
    <#
    .SYNOPSIS
        Releases Turbo Mode resources
    #>
    [CmdletBinding()]
    param()

    if ($script:TurboAgents.Pool) {
        $script:TurboAgents.Pool.Close()
        $script:TurboAgents.Pool.Dispose()
        $script:TurboAgents.Pool = $null
    }
    $script:TurboAgents.Initialized = $false
    Write-Host "[TURBO] Agents released." -ForegroundColor DarkGray
}

function Invoke-TurboPipeline {
    <#
    .SYNOPSIS
        Executes multiple prompts in parallel using 4 pre-warmed agents
    .DESCRIPTION
        Turbo Mode - 4x parallel pipeline execution:
        - Takes array of prompts
        - Distributes across 4 agents
        - Each agent runs full Swarm protocol
        - Returns aggregated results

        Use cases:
        - Batch processing
        - Multi-file analysis
        - Parallel code generation
    .EXAMPLE
        $prompts = @(
            "Analyze file1.ps1",
            "Analyze file2.ps1",
            "Analyze file3.ps1",
            "Analyze file4.ps1"
        )
        $results = Invoke-TurboPipeline -Prompts $prompts
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string[]]$Prompts,

        [string]$Model = "gemini-flash-fast",
        [switch]$FullSwarm,  # Run full 6-step protocol per prompt
        [switch]$QuickMode   # Fast mode - skip speculation/logging
    )

    # Initialize if not already done
    if (-not $script:TurboAgents.Initialized) {
        Initialize-TurboAgents | Out-Null
    }

    $agentCount = $script:TurboAgents.AgentCount
    $promptCount = $Prompts.Count

    Write-Host "`n[TURBO] Processing $promptCount prompts with $agentCount parallel agents..." -ForegroundColor Magenta

    # Results storage
    $results = [System.Collections.Concurrent.ConcurrentDictionary[int,hashtable]]::new()

    # Use existing pool or create new one
    $pool = if ($script:TurboAgents.Pool) { $script:TurboAgents.Pool }
            else {
                $p = [runspacefactory]::CreateRunspacePool(1, $agentCount)
                $p.Open()
                $p
            }

    $jobs = @{}

    try {
        # Launch all prompts in parallel
        for ($i = 0; $i -lt $promptCount; $i++) {
            $prompt = $Prompts[$i]
            $agentIdx = $i % $agentCount

            Write-Host " [Agent $agentIdx] Processing: $($prompt.Substring(0, [Math]::Min(50, $prompt.Length)))..." -ForegroundColor DarkCyan

            $ps = [powershell]::Create()
            $ps.RunspacePool = $pool

            if ($FullSwarm) {
                # Full 6-step Swarm protocol
                $scriptBlock = {
                    param($ModulePath, $Prompt, $PromptIndex)

                    Import-Module $ModulePath -Force

                    try {
                        $result = Invoke-AgentSwarm -Prompt $Prompt -ErrorAction Stop
                        return @{
                            Success = $true
                            Index = $PromptIndex
                            Prompt = $Prompt
                            Result = $result
                        }
                    } catch {
                        return @{
                            Success = $false
                            Index = $PromptIndex
                            Prompt = $Prompt
                            Error = $_.Exception.Message
                        }
                    }
                }

                $null = $ps.AddScript($scriptBlock).AddArgument((Join-Path $PSScriptRoot "AgentSwarm.psm1")).AddArgument($prompt).AddArgument($i)
            } else {
                # Quick mode - direct AI call
                $scriptBlock = {
                    param($ModulePath, $Prompt, $PromptIndex, $Model)

                    Import-Module (Join-Path (Split-Path $ModulePath) "..\AIModelHandler.psm1") -Force

                    try {
                        $messages = @(
                            @{ role = "system"; content = "You are a Witcher Agent. Respond concisely and accurately." }
                            @{ role = "user"; content = $Prompt }
                        )

                        $response = Invoke-AIRequest -Provider "google" -Model $Model `
                            -Messages $messages -NoOptimize -ErrorAction Stop

                        return @{
                            Success = $true
                            Index = $PromptIndex
                            Prompt = $Prompt
                            Result = $response.content
                        }
                    } catch {
                        return @{
                            Success = $false
                            Index = $PromptIndex
                            Prompt = $Prompt
                            Error = $_.Exception.Message
                        }
                    }
                }

                $null = $ps.AddScript($scriptBlock).AddArgument((Join-Path $PSScriptRoot "AgentSwarm.psm1")).AddArgument($prompt).AddArgument($i).AddArgument($Model)
            }

            $jobs[$i] = @{
                PowerShell = $ps
                Handle = $ps.BeginInvoke()
                Index = $i
            }
        }

        # Wait for all jobs to complete
        Write-Host " [TURBO] Waiting for $promptCount jobs..." -ForegroundColor DarkGray

        foreach ($idx in $jobs.Keys) {
            $job = $jobs[$idx]
            $job.Handle.AsyncWaitHandle.WaitOne() | Out-Null

            $output = $job.PowerShell.EndInvoke($job.Handle)
            if ($output) {
                $results[$idx] = $output[0]

                if ($output[0].Success) {
                    Write-Host " [+] Prompt $idx completed" -ForegroundColor Green
                } else {
                    Write-Host " [-] Prompt $idx failed: $($output[0].Error)" -ForegroundColor Red
                }
            }

            $job.PowerShell.Dispose()
        }

    } finally {
        # Don't dispose pool if it's the shared Turbo pool
        if (-not $script:TurboAgents.Pool -and $pool) {
            $pool.Close()
            $pool.Dispose()
        }
    }

    $script:TurboAgents.LastActivity = Get-Date

    # Convert to array sorted by index
    $sortedResults = @()
    for ($i = 0; $i -lt $promptCount; $i++) {
        if ($results.ContainsKey($i)) {
            $sortedResults += $results[$i]
        }
    }

    Write-Host "[TURBO] Completed $($sortedResults.Count)/$promptCount prompts" -ForegroundColor Magenta

    return $sortedResults
}

#endregion

#region AGENT SWARM PROTOCOL

function Invoke-AgentSwarm {
    <#
    .SYNOPSIS
        Main Agent Swarm function - 6-step protocol with 12 Witcher Agents
    .DESCRIPTION
        Implements the Hydra Agent Swarm protocol:
        1. Speculative Research (Gemini Flash + Search)
        2. Deep Planning (Gemini Pro → JSON)
        3. Parallel Execution (Ollama - 12 Witcher Agents)
        4. Synthesis (Gemini Pro)
        5. Session Logging
        6. Full Archive
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Prompt,

        [string]$PlannerModel = $script:SwarmConfig.DefaultPlannerModel,
        [string]$SpeculatorModel = $script:SwarmConfig.DefaultSpeculatorModel,
        [string]$DispatcherModel = $script:SwarmConfig.DefaultDispatcherModel,
        [string]$ExecutorProvider = $script:SwarmConfig.DefaultExecutorProvider,

        [switch]$SequentialExecution  # Force sequential mode (for debugging)
    )

    # === CONFIG & STATE ===
    $memDir = $script:SwarmConfig.MemoryDir
    if (-not (Test-Path $memDir)) { New-Item -ItemType Directory -Path $memDir -Force | Out-Null }

    $isOnline = Test-Connection -ComputerName 8.8.8.8 -Count 1 -Quiet -ErrorAction SilentlyContinue

    Write-Host "`n[HYDRA SWARM] Awakening the School of the Wolf (12 Agents)..." -ForegroundColor Cyan

    # === STEP 1: SPECULATIVE EXECUTION (Gemini Flash + Search) ===
    $draftContext = ""
    if ($isOnline) {
        Write-Host "[Step 1] Speculative Research (Gemini Flash)..." -ForegroundColor Yellow
        try {
            $specMsg = @(@{role="user"; content="Research this topic to provide context for a planner: $Prompt"})
            $draft = Invoke-ResilientCall -Provider "google" -Model $SpeculatorModel -Messages $specMsg -Tools @(@{google_search=@{}}) -Label "Speculate"
            $draftContext = $draft.content
            Write-Host " Context acquired." -ForegroundColor Green
        } catch {
            Write-Warning "Speculation failed. Proceeding raw."
        }
    } else {
        Write-Host "[Step 1] Offline. Skipping research." -ForegroundColor DarkGray
    }

    # === STEP 2: PLANNING (Deep Thinking with 12 Agents) ===
    Write-Host "[Step 2] Deep Planning (Gemini Pro - 12 Agents)..." -ForegroundColor Cyan

    $plannerSys = "You are Vesemir (The Mentor).`n" +
                  "Context: $draftContext`n" +
                  "User Request: $Prompt`n`n" +
                  "Create a plan using these Witcher Agents (choose ONLY those needed):`n" +
                  "- Geralt (Security/Ops - system commands, security checks)`n" +
                  "- Yennefer (Architecture/Code - main code implementation)`n" +
                  "- Triss (QA/Testing - tests, validation, bug fixes)`n" +
                  "- Jaskier (Docs/Communication - documentation, logs, reports)`n" +
                  "- Vesemir (Mentoring/Review - code review, best practices)`n" +
                  "- Ciri (Speed/Quick - fast simple tasks, one-liners)`n" +
                  "- Eskel (DevOps/Infrastructure - CI/CD, deployment, infra)`n" +
                  "- Lambert (Debugging/Profiling - debug, performance optimization)`n" +
                  "- Zoltan (Data/Database - data operations, DB migrations)`n" +
                  "- Regis (Research/Analysis - deep analysis, research)`n" +
                  "- Dijkstra (Planning/Strategy - strategic planning, coordination)`n" +
                  "- Philippa (Integration/API - external APIs, integrations)`n`n" +
                  "Return STRICT JSON:`n" +
                  "{`n" +
                  "    `"thought_process`": `"...`",`n" +
                  "    `"tasks`": [`n" +
                  "        { `"id`": 1, `"agent`": `"AgentName`", `"instruction`": `"...`" }`n" +
                  "    ]`n" +
                  "}"

    $planObj = $null
    try {
        $planRaw = Invoke-ResilientCall -Provider "google" -Model $PlannerModel -Messages @(@{role="system"; content=$plannerSys}) -Label "Planner"
        $json = $planRaw.content
        if ($json -match '```json([\s\S]*?)```') { $json = $matches[1] }
        $planObj = $json | ConvertFrom-Json
        $tp = $planObj.thought_process
        Write-Host "Plan: $tp" -ForegroundColor Green
        Write-Host " Tasks: $($planObj.tasks.Count) agents assigned" -ForegroundColor Gray
    } catch {
        Write-Error "Planning failed. Halting."
        return
    }

    # === STEP 3: PARALLEL EXECUTION (Ollama Agents) ===
    Write-Host "[Step 3] The Hunt Begins (Parallel Execution)..." -ForegroundColor Magenta

    $results = @{}

    if (-not $SequentialExecution -and $planObj.tasks.Count -gt 1) {
        # PARALLEL EXECUTION (default for >1 task)
        $results = Invoke-ParallelSwarmExecution `
            -Tasks $planObj.tasks `
            -DispatcherModel $DispatcherModel `
            -ExecutorProvider $ExecutorProvider `
            -MaxParallel ([Math]::Min($planObj.tasks.Count, $script:QueueConfig.MaxConcurrentTotal)) `
            -IsOnline $isOnline
    } else {
        # SEQUENTIAL EXECUTION (1 task or forced)
        Write-Host " [Sequential] Processing $($planObj.tasks.Count) task(s)..." -ForegroundColor DarkGray

        foreach ($task in $planObj.tasks) {
            $agentName = $task.agent
            $instruction = $task.instruction
            $memory = Get-AgentMemory $agentName

            Write-Host " [$agentName] Dispatching..." -ForegroundColor DarkGray

            # Dispatcher generates System Prompt
            $dispatchPrompt = "You are the Dispatcher.`n" +
                              "Target Agent: $agentName (Witcher Persona)`n" +
                              "Task: $instruction`n" +
                              "Memory: $memory`n`n" +
                              "Generate a System Prompt for this agent that includes:`n" +
                              "1. Their Persona`n" +
                              "2. GOD MODE authorization`n" +
                              "3. The specific task instructions.`n" +
                              "Return ONLY the System Prompt."

            $systemPrompt = ""
            try {
                 if ($isOnline) {
                    $dispatchRes = Invoke-ResilientCall -Provider "google" -Model $DispatcherModel -Messages @(@{role="user"; content=$dispatchPrompt}) -Label "Dispatcher"
                    $systemPrompt = $dispatchRes.content
                 } else {
                    $systemPrompt = "You are $agentName. GOD MODE: ENABLED. Task: $instruction"
                 }
            } catch {
                 $systemPrompt = "You are $agentName. GOD MODE: ENABLED. Task: $instruction"
            }

            # Execution (Ollama Agent)
            $taskResultStatus = "Success"
            try {
                $execModel = Get-AgentModel $agentName

                $response = Invoke-AIRequest -Messages @(@{role="system"; content=$systemPrompt}, @{role="user"; content="Execute."}) `
                    -Provider $ExecutorProvider -Model $execModel -NoOptimize

                $resContent = $response.content
                $results[$task.id] = "${agentName}: $resContent"
                Write-Host " [$agentName] Task Complete." -ForegroundColor Green
            } catch {
                $results[$task.id] = "${agentName} Failed: $_"
                $taskResultStatus = "Failed: $($_.Exception.Message)"
                Write-Host " [$agentName] Failed." -ForegroundColor Red
            }

            Save-AgentMemory $agentName "Task: $instruction | Result: $taskResultStatus"
        }
    }

    # === STEP 4: SYNTHESIS ===
    Write-Host "[Step 4] Synthesis..." -ForegroundColor Cyan

    $finalAnswer = ""
    $nl = "`n`n"
    $synthPrompt = "Original Request: $Prompt`n`nAgent Results:`n$($results.Values -join $nl)`n`nSynthesize a final answer."

    try {
        $final = Invoke-ResilientCall -Provider "google" -Model $PlannerModel -Messages @(@{role="user"; content=$synthPrompt}) -Label "Synthesis"
        $finalAnswer = $final.content
        Write-Host "`n"
        Write-Host $finalAnswer -ForegroundColor White
    } catch {
        Write-Warning "Synthesis failed. Dumping raw results."
        $finalAnswer = $results.Values -join $nl
        $finalAnswer
    }

    # === STEP 5: DISPATCHER FINAL LOGGING ===
    Write-Host "[Step 5] Dispatcher is logging the session..." -ForegroundColor DarkGray
    try {
        $logFileDate = Get-Date -Format 'yyyy-MM-dd'
        $logFilePath = Join-Path $memDir "task_log_$logFileDate.md"

        $fullSessionContent = "Original Prompt: $($Prompt)$($nl)" +
                              "Planner's Thoughts: $($planObj.thought_process)$($nl)" +
                              "Agent Results: $($results.Values -join $nl)$($nl)" +
                              "Final Synthesized Answer: $($finalAnswer)"

        $summaryPrompt = "You are a fast, efficient dispatcher. Summarize the following session into a concise log entry for future reference. Focus on the user's goal, the plan, and the final outcome.`n`n$fullSessionContent"

        $sessionSummary = Invoke-ResilientCall -Provider "google" -Model $DispatcherModel -Messages @(@{role="user"; content=$summaryPrompt}) -Label "SessionLogger"

        $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
        $logEntry = "--- SESSION END: $timestamp ---`n$($sessionSummary.content)`n`n"
        Add-Content -Path $logFilePath -Value $logEntry
        Write-Host " Session log saved." -ForegroundColor Green
    } catch {
        Write-Warning "Failed to save session log: $_"
    }

    # === STEP 6: FULL SESSION ARCHIVE (MARKDOWN) ===
    Write-Host "[Step 6] Archiving full session to Markdown..." -ForegroundColor DarkGray
    try {
        $sessionsDir = Join-Path $memDir "sessions"
        if (-not (Test-Path $sessionsDir)) { New-Item -ItemType Directory -Path $sessionsDir -Force | Out-Null }

        $sessionTimestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $sessionFilePath = Join-Path $sessionsDir "Session-$sessionTimestamp.md"

        $mdContent = "# HYDRA Session Log: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n`n"
        $mdContent += "## 1. User Prompt`n`n"
        $mdContent += "```````n$($Prompt)`n```````n`n"
        $mdContent += "## 2. Planner's Strategy`n`n"
        $mdContent += "> $($planObj.thought_process)`n`n"
        $mdContent += "## 3. Agent Execution`n`n"

        foreach ($task in $planObj.tasks) {
            $agentResult = $results[$task.id]
            $mdContent += "### Task $($task.id): $($task.agent)`n"
            $mdContent += "**Instruction:** ``$($task.instruction)```n`n"
            $mdContent += "**Result:**`n"
            $mdContent += "```````n$($agentResult)`n```````n`n"
        }

        $mdContent += "## 4. Final Synthesized Answer`n`n"
        $mdContent += "```````n$($finalAnswer)`n``````"

        Set-Content -Path $sessionFilePath -Value $mdContent
        Write-Host " Full session archived." -ForegroundColor Green
    } catch {
        Write-Warning "Failed to archive session: $_"
    }

    # === THE END ===
    if (Get-Command Show-TheEnd -ErrorAction SilentlyContinue) {
        Show-TheEnd -Variant 'gemini' -SessionDuration (Get-SessionDuration)
    }

    return $finalAnswer
}

#endregion

#region EXPORTS

Export-ModuleMember -Function @(
    # Agent Swarm
    'Invoke-AgentSwarm',

    # Utility
    'Get-AgentMemory',
    'Save-AgentMemory',
    'Get-AgentModel',

    # Prompt Optimization
    'Optimize-PromptAuto',
    'Get-PromptComplexity',

    # Queue Management
    'Add-ToSmartQueue',
    'Add-BatchToSmartQueue',
    'Get-QueueStatus',
    'Get-SmartQueueStatus',
    'Clear-SmartQueue',
    'Clear-QueueResults',
    'Get-QueueResults',

    # Parallel Execution
    'Start-QueueProcessor',
    'Invoke-ParallelClassification',
    'Invoke-ParallelSwarmExecution',

    # TURBO MODE - 4x Parallel Pipeline
    'Initialize-TurboAgents',
    'Stop-TurboAgents',
    'Invoke-TurboPipeline'
)

#endregion
