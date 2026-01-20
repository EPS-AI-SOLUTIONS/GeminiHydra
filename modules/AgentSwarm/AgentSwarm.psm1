#Requires -Version 5.1
<#
.SYNOPSIS
    AgentSwarm.psm1 v3.0 - The 12 Witcher Agents Protocol

.DESCRIPTION
    6-Step Swarm Protocol with parallel execution via RunspacePool.
    Features 12 specialized Witcher agents from the School of the Wolf.

.AUTHOR
    ClaudeCli Local - Jaskier Edition

.VERSION
    3.0.0
#>

# ============================================================================
# CONFIGURATION
# ============================================================================

$script:SwarmVersion = "3.0.0"
$script:OllamaUrl = "http://localhost:11434"
$script:MemoryPath = Join-Path $PSScriptRoot "..\..\..\.serena\memories"
$script:YoloMode = $false

# Agent Model Mapping - School of the Wolf
$script:AgentModels = @{
    "Ciri"     = "llama3.2:1b"           # Fastest - simple tasks
    "Regis"    = "phi3:mini"             # Analytical - deep research
    "Yennefer" = "qwen2.5-coder:1.5b"    # Code - architecture
    "Triss"    = "qwen2.5-coder:1.5b"    # Code - testing
    "Lambert"  = "qwen2.5-coder:1.5b"    # Code - debug
    "Philippa" = "qwen2.5-coder:1.5b"    # Code - integrations
    "Geralt"   = "llama3.2:3b"           # General - security/ops
    "Jaskier"  = "llama3.2:3b"           # General - docs/communication
    "Vesemir"  = "llama3.2:3b"           # General - mentoring/review
    "Eskel"    = "llama3.2:3b"           # General - devops/infra
    "Zoltan"   = "llama3.2:3b"           # General - data/database
    "Dijkstra" = "llama3.2:3b"           # General - planning/strategy
}

# Agent Specializations
$script:AgentSpecs = @{
    "Geralt"   = @{ Persona = "White Wolf";   Focus = "Security/Ops";         Skills = @("system commands", "security checks", "threat analysis") }
    "Yennefer" = @{ Persona = "Sorceress";    Focus = "Architecture/Code";    Skills = @("code implementation", "architecture design", "refactoring") }
    "Triss"    = @{ Persona = "Healer";       Focus = "QA/Testing";           Skills = @("tests", "validation", "bug fixes", "quality assurance") }
    "Jaskier"  = @{ Persona = "Bard";         Focus = "Docs/Communication";   Skills = @("documentation", "logs", "reports", "user communication") }
    "Vesemir"  = @{ Persona = "Mentor";       Focus = "Mentoring/Review";     Skills = @("code review", "best practices", "teaching", "guidance") }
    "Ciri"     = @{ Persona = "Prodigy";      Focus = "Speed/Quick";          Skills = @("fast tasks", "simple operations", "quick responses") }
    "Eskel"    = @{ Persona = "Pragmatist";   Focus = "DevOps/Infrastructure";Skills = @("CI/CD", "deployment", "infrastructure", "automation") }
    "Lambert"  = @{ Persona = "Skeptic";      Focus = "Debugging/Profiling";  Skills = @("debugging", "performance optimization", "profiling") }
    "Zoltan"   = @{ Persona = "Craftsman";    Focus = "Data/Database";        Skills = @("data operations", "DB migrations", "data modeling") }
    "Regis"    = @{ Persona = "Sage";         Focus = "Research/Analysis";    Skills = @("deep analysis", "research", "complex reasoning") }
    "Dijkstra" = @{ Persona = "Spymaster";    Focus = "Planning/Strategy";    Skills = @("strategic planning", "coordination", "resource allocation") }
    "Philippa" = @{ Persona = "Strategist";   Focus = "Integration/API";      Skills = @("external APIs", "integrations", "third-party services") }
}

# Performance Settings
$script:StandardMode = @{
    MaxConcurrency = 5
    SafetyBlocking = $true
    RetryAttempts  = 3
    TimeoutSeconds = 60
}

$script:YoloModeSettings = @{
    MaxConcurrency = 10
    SafetyBlocking = $false
    RetryAttempts  = 1
    TimeoutSeconds = 15
}

# Smart Queue
$script:SmartQueue = [System.Collections.Concurrent.ConcurrentQueue[hashtable]]::new()
$script:QueueResults = [System.Collections.Concurrent.ConcurrentDictionary[string, object]]::new()

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

function Write-SwarmStatus {
    param(
        [string]$Step,
        [string]$Message,
        [string]$Agent = "",
        [ValidateSet("Info", "Success", "Warning", "Error", "Progress")]
        [string]$Type = "Info"
    )

    $timestamp = Get-Date -Format "HH:mm:ss"
    $colors = @{
        Info     = "Cyan"
        Success  = "Green"
        Warning  = "Yellow"
        Error    = "Red"
        Progress = "Magenta"
    }

    $prefix = switch ($Type) {
        "Info"     { "[i]" }
        "Success"  { "[+]" }
        "Warning"  { "[!]" }
        "Error"    { "[X]" }
        "Progress" { "[>]" }
    }

    $agentStr = if ($Agent) { " [$Agent]" } else { "" }
    Write-Host "[$timestamp]$agentStr $prefix $Step - $Message" -ForegroundColor $colors[$Type]
}

function Show-TheEndBanner {
    $banner = @"

================================================================================

  ████████╗██╗  ██╗███████╗    ███████╗███╗   ██╗██████╗
  ╚══██╔══╝██║  ██║██╔════╝    ██╔════╝████╗  ██║██╔══██╗
     ██║   ███████║█████╗      █████╗  ██╔██╗ ██║██║  ██║
     ██║   ██╔══██║██╔══╝      ██╔══╝  ██║╚██╗██║██║  ██║
     ██║   ██║  ██║███████╗    ███████╗██║ ╚████║██████╔╝
     ╚═╝   ╚═╝  ╚═╝╚══════╝    ╚══════╝╚═╝  ╚═══╝╚═════╝

                    School of the Wolf - AgentSwarm v3.0
================================================================================

"@
    Write-Host $banner -ForegroundColor Green
}

function Test-OllamaConnection {
    try {
        $response = Invoke-RestMethod -Uri "$script:OllamaUrl/api/tags" -Method Get -TimeoutSec 5 -ErrorAction Stop
        return $true
    }
    catch {
        return $false
    }
}

function Get-CurrentSettings {
    if ($script:YoloMode) {
        return $script:YoloModeSettings
    }
    return $script:StandardMode
}

# ============================================================================
# AGENT FUNCTIONS
# ============================================================================

function Get-AgentModel {
    <#
    .SYNOPSIS
        Get Ollama model for specific agent
    #>
    param(
        [Parameter(Mandatory)]
        [ValidateSet("Geralt", "Yennefer", "Triss", "Jaskier", "Vesemir", "Ciri",
                     "Eskel", "Lambert", "Zoltan", "Regis", "Dijkstra", "Philippa")]
        [string]$Agent
    )

    return $script:AgentModels[$Agent]
}

function Get-AgentSpec {
    param(
        [Parameter(Mandatory)]
        [string]$Agent
    )

    return $script:AgentSpecs[$Agent]
}

function Get-AgentMemory {
    <#
    .SYNOPSIS
        Retrieve agent's memory from .serena/memories
    #>
    param(
        [Parameter(Mandatory)]
        [string]$Agent,
        [int]$Limit = 10
    )

    $memoryFile = Join-Path $script:MemoryPath "$Agent.json"

    if (Test-Path $memoryFile) {
        $memories = Get-Content $memoryFile -Raw | ConvertFrom-Json
        return $memories | Select-Object -Last $Limit
    }

    return @()
}

function Save-AgentMemory {
    <#
    .SYNOPSIS
        Save agent's memory with optional rebase
    #>
    param(
        [Parameter(Mandatory)]
        [string]$Agent,
        [Parameter(Mandatory)]
        [hashtable]$Memory,
        [switch]$Rebase
    )

    $memoryFile = Join-Path $script:MemoryPath "$Agent.json"

    # Ensure directory exists
    $dir = Split-Path $memoryFile -Parent
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $entry = @{
        timestamp = (Get-Date).ToString("o")
        agent     = $Agent
        data      = $Memory
    }

    if ($Rebase -or -not (Test-Path $memoryFile)) {
        @($entry) | ConvertTo-Json -Depth 10 | Set-Content $memoryFile
    }
    else {
        $existing = @()
        if (Test-Path $memoryFile) {
            $content = Get-Content $memoryFile -Raw
            if ($content) {
                $existing = @($content | ConvertFrom-Json)
            }
        }
        $existing += $entry

        # Keep only last 100 entries per agent
        if ($existing.Count -gt 100) {
            $existing = $existing | Select-Object -Last 100
        }

        $existing | ConvertTo-Json -Depth 10 | Set-Content $memoryFile
    }

    return $entry
}

function Invoke-AgentTask {
    <#
    .SYNOPSIS
        Execute a single agent task via Ollama
    #>
    param(
        [Parameter(Mandatory)]
        [string]$Agent,
        [Parameter(Mandatory)]
        [string]$Prompt,
        [string]$Context = "",
        [int]$TimeoutSec = 60
    )

    $model = Get-AgentModel -Agent $Agent
    $spec = Get-AgentSpec -Agent $Agent

    $systemPrompt = @"
You are $Agent, the $($spec.Persona) from the School of the Wolf.
Your specialization: $($spec.Focus)
Your skills: $($spec.Skills -join ", ")

Respond in character while completing the task professionally.
Be concise but thorough. Focus on your area of expertise.
"@

    $fullPrompt = if ($Context) {
        "$systemPrompt`n`nContext: $Context`n`nTask: $Prompt"
    }
    else {
        "$systemPrompt`n`nTask: $Prompt"
    }

    $body = @{
        model  = $model
        prompt = $fullPrompt
        stream = $false
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "$script:OllamaUrl/api/generate" `
            -Method Post -Body $body -ContentType "application/json" `
            -TimeoutSec $TimeoutSec -ErrorAction Stop

        return @{
            Success  = $true
            Agent    = $Agent
            Model    = $model
            Response = $response.response
            Duration = $response.total_duration / 1e9  # Convert to seconds
        }
    }
    catch {
        return @{
            Success  = $false
            Agent    = $Agent
            Model    = $model
            Error    = $_.Exception.Message
            Duration = 0
        }
    }
}

# ============================================================================
# SMART QUEUE FUNCTIONS
# ============================================================================

function Add-ToSmartQueue {
    <#
    .SYNOPSIS
        Add single prompt to smart queue
    #>
    param(
        [Parameter(Mandatory)]
        [string]$Prompt,
        [string]$Agent = "Ciri",
        [string]$Priority = "Normal",
        [hashtable]$Metadata = @{}
    )

    $task = @{
        Id       = [guid]::NewGuid().ToString()
        Prompt   = $Prompt
        Agent    = $Agent
        Priority = $Priority
        Metadata = $Metadata
        Status   = "Queued"
        Created  = (Get-Date).ToString("o")
    }

    $script:SmartQueue.Enqueue($task)
    return $task.Id
}

function Add-BatchToSmartQueue {
    <#
    .SYNOPSIS
        Add multiple prompts to queue
    #>
    param(
        [Parameter(Mandatory)]
        [array]$Tasks
    )

    $ids = @()
    foreach ($task in $Tasks) {
        $priority = if ($task.Priority) { $task.Priority } else { "Normal" }
        $metadata = if ($task.Metadata) { $task.Metadata } else { @{} }
        $id = Add-ToSmartQueue -Prompt $task.Prompt -Agent $task.Agent `
            -Priority $priority -Metadata $metadata
        $ids += $id
    }
    return $ids
}

function Get-QueueStatus {
    return @{
        QueueCount   = $script:SmartQueue.Count
        ResultsCount = $script:QueueResults.Count
        Timestamp    = Get-Date
    }
}

function Get-SmartQueueStatus { Get-QueueStatus }

function Clear-SmartQueue {
    while ($script:SmartQueue.TryDequeue([ref]$null)) { }
    Write-SwarmStatus -Step "Queue" -Message "Smart queue cleared" -Type Success
}

function Clear-QueueResults {
    $script:QueueResults.Clear()
    Write-SwarmStatus -Step "Queue" -Message "Queue results cleared" -Type Success
}

function Get-QueueResults {
    param([string]$TaskId)

    if ($TaskId) {
        if ($script:QueueResults.ContainsKey($TaskId)) {
            return $script:QueueResults[$TaskId]
        }
        return $null
    }

    return $script:QueueResults.ToArray()
}

# ============================================================================
# PARALLEL EXECUTION
# ============================================================================

function Start-QueueProcessor {
    <#
    .SYNOPSIS
        Process queue with RunspacePool for parallel execution
    #>
    param(
        [int]$MaxConcurrency = 5,
        [int]$TimeoutSec = 60
    )

    $settings = Get-CurrentSettings
    $maxThreads = [Math]::Min($MaxConcurrency, $settings.MaxConcurrency)

    Write-SwarmStatus -Step "Queue" -Message "Starting processor with $maxThreads threads" -Type Progress

    # Create RunspacePool
    $runspacePool = [runspacefactory]::CreateRunspacePool(1, $maxThreads)
    $runspacePool.Open()

    $jobs = @()
    $results = @()

    # Dequeue and process
    while ($script:SmartQueue.TryDequeue([ref]$task)) {
        $powershell = [powershell]::Create()
        $powershell.RunspacePool = $runspacePool

        [void]$powershell.AddScript({
            param($Task, $OllamaUrl, $AgentModels, $AgentSpecs)

            $agent = $Task.Agent
            $model = $AgentModels[$agent]
            $spec = $AgentSpecs[$agent]

            $systemPrompt = "You are $agent, the $($spec.Persona). Focus: $($spec.Focus)"
            $fullPrompt = "$systemPrompt`n`nTask: $($Task.Prompt)"

            $body = @{
                model  = $model
                prompt = $fullPrompt
                stream = $false
            } | ConvertTo-Json

            try {
                $response = Invoke-RestMethod -Uri "$OllamaUrl/api/generate" `
                    -Method Post -Body $body -ContentType "application/json" `
                    -TimeoutSec 60 -ErrorAction Stop

                return @{
                    TaskId   = $Task.Id
                    Success  = $true
                    Agent    = $agent
                    Response = $response.response
                    Duration = $response.total_duration / 1e9
                }
            }
            catch {
                return @{
                    TaskId  = $Task.Id
                    Success = $false
                    Agent   = $agent
                    Error   = $_.Exception.Message
                }
            }
        })

        [void]$powershell.AddArgument($task)
        [void]$powershell.AddArgument($script:OllamaUrl)
        [void]$powershell.AddArgument($script:AgentModels)
        [void]$powershell.AddArgument($script:AgentSpecs)

        $jobs += @{
            PowerShell = $powershell
            Handle     = $powershell.BeginInvoke()
            TaskId     = $task.Id
        }
    }

    # Wait for completion
    foreach ($job in $jobs) {
        try {
            $result = $job.PowerShell.EndInvoke($job.Handle)
            if ($result) {
                $script:QueueResults[$job.TaskId] = $result
                $results += $result
            }
        }
        catch {
            Write-SwarmStatus -Step "Queue" -Message "Job failed: $_" -Type Error
        }
        finally {
            $job.PowerShell.Dispose()
        }
    }

    $runspacePool.Close()
    $runspacePool.Dispose()

    Write-SwarmStatus -Step "Queue" -Message "Processed $($results.Count) tasks" -Type Success
    return $results
}

function Invoke-ParallelSwarmExecution {
    <#
    .SYNOPSIS
        Execute multiple agent tasks in parallel
    #>
    param(
        [Parameter(Mandatory)]
        [array]$Tasks,
        [int]$MaxConcurrency = 5
    )

    $settings = Get-CurrentSettings
    $maxThreads = [Math]::Min($MaxConcurrency, $settings.MaxConcurrency)

    Write-SwarmStatus -Step "Parallel" -Message "Executing $($Tasks.Count) tasks with $maxThreads threads" -Type Progress

    $runspacePool = [runspacefactory]::CreateRunspacePool(1, $maxThreads)
    $runspacePool.Open()

    $jobs = @()

    foreach ($task in $Tasks) {
        $powershell = [powershell]::Create()
        $powershell.RunspacePool = $runspacePool

        [void]$powershell.AddScript({
            param($Task, $OllamaUrl, $AgentModels, $AgentSpecs, $TimeoutSec)

            $agent = $Task.Agent
            $model = $AgentModels[$agent]
            $spec = $AgentSpecs[$agent]

            $systemPrompt = @"
You are $agent, the $($spec.Persona) from the School of the Wolf.
Specialization: $($spec.Focus)
Skills: $($spec.Skills -join ", ")
"@
            $fullPrompt = "$systemPrompt`n`nTask: $($Task.Prompt)"

            $body = @{
                model  = $model
                prompt = $fullPrompt
                stream = $false
            } | ConvertTo-Json

            $startTime = Get-Date

            try {
                $response = Invoke-RestMethod -Uri "$OllamaUrl/api/generate" `
                    -Method Post -Body $body -ContentType "application/json" `
                    -TimeoutSec $TimeoutSec -ErrorAction Stop

                $taskId = if ($Task.Id) { $Task.Id } else { [guid]::NewGuid().ToString() }
                return @{
                    TaskId   = $taskId
                    Success  = $true
                    Agent    = $agent
                    Prompt   = $Task.Prompt
                    Response = $response.response
                    Model    = $model
                    Duration = ((Get-Date) - $startTime).TotalSeconds
                    OllamaDuration = $response.total_duration / 1e9
                }
            }
            catch {
                $taskId = if ($Task.Id) { $Task.Id } else { [guid]::NewGuid().ToString() }
                return @{
                    TaskId   = $taskId
                    Success  = $false
                    Agent    = $agent
                    Prompt   = $Task.Prompt
                    Error    = $_.Exception.Message
                    Duration = ((Get-Date) - $startTime).TotalSeconds
                }
            }
        })

        [void]$powershell.AddArgument($task)
        [void]$powershell.AddArgument($script:OllamaUrl)
        [void]$powershell.AddArgument($script:AgentModels)
        [void]$powershell.AddArgument($script:AgentSpecs)
        [void]$powershell.AddArgument($settings.TimeoutSeconds)

        $jobs += @{
            PowerShell = $powershell
            Handle     = $powershell.BeginInvoke()
            Agent      = $task.Agent
        }
    }

    # Collect results
    $results = @()
    foreach ($job in $jobs) {
        try {
            $result = $job.PowerShell.EndInvoke($job.Handle)
            if ($result) {
                $results += $result
                $status = if ($result.Success) { "Success" } else { "Error" }
                Write-SwarmStatus -Step "Task" -Message "Completed in $([math]::Round($result.Duration, 2))s" `
                    -Agent $job.Agent -Type $status
            }
        }
        catch {
            Write-SwarmStatus -Step "Task" -Message "Failed: $_" -Agent $job.Agent -Type Error
        }
        finally {
            $job.PowerShell.Dispose()
        }
    }

    $runspacePool.Close()
    $runspacePool.Dispose()

    return $results
}

function Invoke-ParallelClassification {
    <#
    .SYNOPSIS
        Classify prompts in parallel to determine best agent
    #>
    param(
        [Parameter(Mandatory)]
        [array]$Prompts
    )

    $classifications = @()

    foreach ($prompt in $Prompts) {
        $promptLower = $prompt.ToLower()

        $agent = switch -Regex ($promptLower) {
            'security|threat|attack|vulnerability|auth'  { "Geralt"; break }
            'architect|design|structure|refactor|code'   { "Yennefer"; break }
            'test|qa|quality|bug|validate|assert'        { "Triss"; break }
            'document|readme|explain|report|log'         { "Jaskier"; break }
            'review|mentor|best.?practice|guideline'     { "Vesemir"; break }
            'quick|fast|simple|easy|trivial'             { "Ciri"; break }
            'deploy|ci|cd|docker|kubernetes|infra'       { "Eskel"; break }
            'debug|profile|performance|optimize|slow'    { "Lambert"; break }
            'data|database|sql|migration|schema'         { "Zoltan"; break }
            'research|analyze|complex|deep|investigate'  { "Regis"; break }
            'plan|strategy|coordinate|schedule|allocate' { "Dijkstra"; break }
            'api|integration|external|third.?party|http' { "Philippa"; break }
            default                                      { "Yennefer" }
        }

        $classifications += @{
            Prompt = $prompt
            Agent  = $agent
            Model  = $script:AgentModels[$agent]
        }
    }

    return $classifications
}

# ============================================================================
# PROMPT OPTIMIZATION
# ============================================================================

function Get-PromptComplexity {
    <#
    .SYNOPSIS
        Analyze prompt complexity
    #>
    param(
        [Parameter(Mandatory)]
        [string]$Prompt
    )

    $wordCount = ($Prompt -split '\s+').Count
    $hasCode = $Prompt -match '```|function|class|def |const |let |var '
    $hasMultipleTasks = $Prompt -match '\d\.\s|•|\*\s|-\s'
    $technicalTerms = ($Prompt | Select-String -Pattern 'api|database|async|parallel|thread|memory|performance' -AllMatches).Matches.Count

    $score = 0
    $score += [Math]::Min($wordCount / 10, 5)
    $score += if ($hasCode) { 3 } else { 0 }
    $score += if ($hasMultipleTasks) { 2 } else { 0 }
    $score += $technicalTerms

    $level = switch ($score) {
        { $_ -le 2 }  { "Simple" }
        { $_ -le 5 }  { "Moderate" }
        { $_ -le 8 }  { "Complex" }
        default       { "Advanced" }
    }

    return @{
        Score           = [Math]::Round($score, 1)
        Level           = $level
        WordCount       = $wordCount
        HasCode         = $hasCode
        HasMultipleTasks = $hasMultipleTasks
        TechnicalTerms  = $technicalTerms
        RecommendedAgent = switch ($level) {
            "Simple"   { "Ciri" }
            "Moderate" { "Yennefer" }
            "Complex"  { "Regis" }
            "Advanced" { "Regis" }
        }
    }
}

function Optimize-PromptAuto {
    <#
    .SYNOPSIS
        Auto-improve prompts based on complexity analysis
    #>
    param(
        [Parameter(Mandatory)]
        [string]$Prompt
    )

    $complexity = Get-PromptComplexity -Prompt $Prompt

    $optimized = $Prompt

    # Add structure for complex prompts
    if ($complexity.Level -in @("Complex", "Advanced") -and -not $complexity.HasMultipleTasks) {
        $optimized = "Please complete the following task step by step:`n`n$Prompt`n`nProvide a structured response."
    }

    # Add code formatting hint
    if ($complexity.HasCode -or $Prompt -match 'code|function|implement') {
        $optimized += "`n`nUse proper code formatting with language tags."
    }

    return @{
        Original          = $Prompt
        Optimized         = $optimized
        Complexity        = $complexity
        RecommendedAgent  = $complexity.RecommendedAgent
    }
}

# ============================================================================
# 6-STEP SWARM PROTOCOL
# ============================================================================

function Invoke-AgentSwarm {
    <#
    .SYNOPSIS
        Main 6-step protocol with 12 Witcher agents

    .DESCRIPTION
        Step 1: Speculate - Gather research context (Regis)
        Step 2: Plan - Create JSON task plan (Dijkstra)
        Step 3: Execute - Run agents via RunspacePool (Parallel)
        Step 4: Synthesize - Merge results (Yennefer)
        Step 5: Log - Create session summary (Jaskier)
        Step 6: Archive - Save Markdown transcript

    .PARAMETER Query
        The main query/task to process

    .PARAMETER YoloMode
        Enable YOLO mode (fast & dangerous)

    .PARAMETER SkipResearch
        Skip Step 1 (Speculate)

    .PARAMETER Verbose
        Enable verbose output
    #>
    param(
        [Parameter(Mandatory)]
        [string]$Query,
        [switch]$YoloMode,
        [switch]$SkipResearch,
        [switch]$VerboseOutput
    )

    $startTime = Get-Date
    $sessionId = [guid]::NewGuid().ToString().Substring(0, 8)

    # Set mode
    $script:YoloMode = $YoloMode
    $settings = Get-CurrentSettings
    $modeStr = if ($YoloMode) { "YOLO (Fast & Dangerous)" } else { "Standard" }

    Write-Host ""
    Write-Host "=" * 80 -ForegroundColor Cyan
    Write-Host "  AGENT SWARM v$script:SwarmVersion - School of the Wolf" -ForegroundColor Cyan
    Write-Host "  Session: $sessionId | Mode: $modeStr" -ForegroundColor Cyan
    Write-Host "=" * 80 -ForegroundColor Cyan
    Write-Host ""

    # Check Ollama
    if (-not (Test-OllamaConnection)) {
        Write-SwarmStatus -Step "Init" -Message "Ollama not available at $script:OllamaUrl" -Type Error
        return @{ Success = $false; Error = "Ollama not available" }
    }
    Write-SwarmStatus -Step "Init" -Message "Ollama connected" -Type Success

    $transcript = @{
        SessionId = $sessionId
        Query     = $Query
        Mode      = $modeStr
        StartTime = $startTime.ToString("o")
        Steps     = @{}
    }

    # =========================================================================
    # STEP 1: SPECULATE (Regis - Research/Analysis)
    # =========================================================================
    Write-Host ""
    Write-Host "--- STEP 1: SPECULATE (Regis - The Sage) ---" -ForegroundColor Yellow

    $step1Result = $null
    if (-not $SkipResearch) {
        $researchPrompt = @"
Analyze this query and provide research context:
Query: $Query

Provide:
1. Key concepts to understand
2. Potential approaches
3. Required knowledge domains
4. Complexity assessment (Simple/Moderate/Complex/Advanced)
5. Recommended agents from: Geralt, Yennefer, Triss, Jaskier, Vesemir, Ciri, Eskel, Lambert, Zoltan, Regis, Dijkstra, Philippa
"@

        Write-SwarmStatus -Step "Speculate" -Message "Gathering research context..." -Agent "Regis" -Type Progress
        $step1Result = Invoke-AgentTask -Agent "Regis" -Prompt $researchPrompt -TimeoutSec $settings.TimeoutSeconds

        if ($step1Result.Success) {
            Write-SwarmStatus -Step "Speculate" -Message "Research complete ($([math]::Round($step1Result.Duration, 2))s)" -Agent "Regis" -Type Success
        }
        else {
            Write-SwarmStatus -Step "Speculate" -Message "Research failed: $($step1Result.Error)" -Agent "Regis" -Type Warning
        }
    }
    else {
        Write-SwarmStatus -Step "Speculate" -Message "Skipped (SkipResearch flag)" -Type Info
    }
    $transcript.Steps["Speculate"] = $step1Result

    # =========================================================================
    # STEP 2: PLAN (Dijkstra - Planning/Strategy)
    # =========================================================================
    Write-Host ""
    Write-Host "--- STEP 2: PLAN (Dijkstra - The Spymaster) ---" -ForegroundColor Yellow

    $context = if ($step1Result.Success) { $step1Result.Response } else { "" }

    $planPrompt = @"
Create a task execution plan for this query:
Query: $Query

$(if ($context) { "Research Context: $context" })

Create a JSON plan with this structure:
{
  "complexity": "Simple|Moderate|Complex|Advanced",
  "tasks": [
    {
      "id": 1,
      "agent": "AgentName",
      "task": "Task description",
      "depends_on": [],
      "priority": "high|medium|low"
    }
  ],
  "parallel_groups": [[1,2], [3]],
  "estimated_time": "Xs"
}

Available agents: Geralt (Security), Yennefer (Code), Triss (Testing), Jaskier (Docs),
Vesemir (Review), Ciri (Quick), Eskel (DevOps), Lambert (Debug), Zoltan (Data),
Regis (Research), Dijkstra (Planning), Philippa (API)
"@

    Write-SwarmStatus -Step "Plan" -Message "Creating execution plan..." -Agent "Dijkstra" -Type Progress
    $step2Result = Invoke-AgentTask -Agent "Dijkstra" -Prompt $planPrompt -TimeoutSec $settings.TimeoutSeconds

    $plan = $null
    if ($step2Result.Success) {
        Write-SwarmStatus -Step "Plan" -Message "Plan created ($([math]::Round($step2Result.Duration, 2))s)" -Agent "Dijkstra" -Type Success

        # Try to parse JSON plan
        try {
            if ($step2Result.Response -match '\{[\s\S]*\}') {
                $jsonMatch = $Matches[0]
                $plan = $jsonMatch | ConvertFrom-Json
            }
        }
        catch {
            Write-SwarmStatus -Step "Plan" -Message "Could not parse plan JSON, using fallback" -Type Warning
        }
    }
    $transcript.Steps["Plan"] = @{ Result = $step2Result; ParsedPlan = $plan }

    # Fallback plan if parsing failed
    if (-not $plan) {
        $plan = @{
            complexity = "Moderate"
            tasks = @(
                @{ id = 1; agent = "Yennefer"; task = $Query; depends_on = @(); priority = "high" }
            )
            parallel_groups = @(@(1))
        }
    }

    # =========================================================================
    # STEP 3: EXECUTE (Parallel via RunspacePool)
    # =========================================================================
    Write-Host ""
    Write-Host "--- STEP 3: EXECUTE (Parallel Agents) ---" -ForegroundColor Yellow

    $executionTasks = @()
    foreach ($task in $plan.tasks) {
        $executionTasks += @{
            Id     = $task.id
            Agent  = $task.agent
            Prompt = $task.task
        }
    }

    Write-SwarmStatus -Step "Execute" -Message "Launching $($executionTasks.Count) agents in parallel..." -Type Progress

    $step3Results = Invoke-ParallelSwarmExecution -Tasks $executionTasks -MaxConcurrency $settings.MaxConcurrency

    $successCount = ($step3Results | Where-Object { $_.Success }).Count
    Write-SwarmStatus -Step "Execute" -Message "$successCount/$($executionTasks.Count) tasks completed" -Type Success

    $transcript.Steps["Execute"] = $step3Results

    # =========================================================================
    # STEP 4: SYNTHESIZE (Yennefer - Merge Results)
    # =========================================================================
    Write-Host ""
    Write-Host "--- STEP 4: SYNTHESIZE (Yennefer - The Sorceress) ---" -ForegroundColor Yellow

    $resultsText = ($step3Results | ForEach-Object {
        if ($_.Success) {
            "[$($_.Agent)] $($_.Response)"
        }
        else {
            "[$($_.Agent)] ERROR: $($_.Error)"
        }
    }) -join "`n`n---`n`n"

    $synthesizePrompt = @"
Synthesize these agent results into a cohesive final answer:

Original Query: $Query

Agent Results:
$resultsText

Create a unified, well-structured response that:
1. Addresses the original query completely
2. Integrates insights from all agents
3. Highlights key findings
4. Provides actionable conclusions
"@

    Write-SwarmStatus -Step "Synthesize" -Message "Merging results..." -Agent "Yennefer" -Type Progress
    $step4Result = Invoke-AgentTask -Agent "Yennefer" -Prompt $synthesizePrompt -TimeoutSec $settings.TimeoutSeconds

    if ($step4Result.Success) {
        Write-SwarmStatus -Step "Synthesize" -Message "Synthesis complete ($([math]::Round($step4Result.Duration, 2))s)" -Agent "Yennefer" -Type Success
    }
    $transcript.Steps["Synthesize"] = $step4Result

    # =========================================================================
    # STEP 5: LOG (Jaskier - Session Summary)
    # =========================================================================
    Write-Host ""
    Write-Host "--- STEP 5: LOG (Jaskier - The Bard) ---" -ForegroundColor Yellow

    $endTime = Get-Date
    $totalDuration = ($endTime - $startTime).TotalSeconds

    $logPrompt = @"
Create a session summary for this Swarm execution:

Session ID: $sessionId
Query: $Query
Duration: $([math]::Round($totalDuration, 2)) seconds
Agents Used: $($step3Results.Agent -join ", ")
Success Rate: $successCount/$($executionTasks.Count) tasks

Final Answer Preview:
$($step4Result.Response.Substring(0, [Math]::Min(500, $step4Result.Response.Length)))...

Create a brief, poetic summary in the style of a bard chronicling an adventure.
"@

    Write-SwarmStatus -Step "Log" -Message "Creating session summary..." -Agent "Jaskier" -Type Progress
    $step5Result = Invoke-AgentTask -Agent "Jaskier" -Prompt $logPrompt -TimeoutSec $settings.TimeoutSeconds

    if ($step5Result.Success) {
        Write-SwarmStatus -Step "Log" -Message "Summary created ($([math]::Round($step5Result.Duration, 2))s)" -Agent "Jaskier" -Type Success
    }
    $transcript.Steps["Log"] = $step5Result

    # =========================================================================
    # STEP 6: ARCHIVE (Save Markdown Transcript)
    # =========================================================================
    Write-Host ""
    Write-Host "--- STEP 6: ARCHIVE (Save Transcript) ---" -ForegroundColor Yellow

    $markdownContent = @"
# AgentSwarm Session: $sessionId

**Date:** $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
**Mode:** $modeStr
**Duration:** $([math]::Round($totalDuration, 2)) seconds
**Query:** $Query

---

## Step 1: Speculate (Regis)
$(if ($step1Result.Success) { $step1Result.Response } else { "_Skipped or failed_" })

---

## Step 2: Plan (Dijkstra)
$(if ($step2Result.Success) { $step2Result.Response } else { "_Planning failed_" })

---

## Step 3: Execute (Parallel)
$($step3Results | ForEach-Object {
    $content = if ($_.Response) { $_.Response } else { $_.Error }
    "### Agent: $($_.Agent)`n$content`n"
})

---

## Step 4: Synthesize (Yennefer)
$(if ($step4Result.Success) { $step4Result.Response } else { "_Synthesis failed_" })

---

## Step 5: Log (Jaskier)
$(if ($step5Result.Success) { $step5Result.Response } else { "_Logging failed_" })

---

## Performance Summary
- Total Duration: $([math]::Round($totalDuration, 2))s
- Tasks Executed: $($executionTasks.Count)
- Success Rate: $successCount/$($executionTasks.Count)
- Agents Used: $($step3Results.Agent -join ", ")

---
*Generated by AgentSwarm v$script:SwarmVersion - School of the Wolf*
"@

    $archivePath = Join-Path $script:MemoryPath "sessions"
    if (-not (Test-Path $archivePath)) {
        New-Item -ItemType Directory -Path $archivePath -Force | Out-Null
    }

    $archiveFile = Join-Path $archivePath "session_$sessionId`_$(Get-Date -Format 'yyyyMMdd_HHmmss').md"
    $markdownContent | Set-Content -Path $archiveFile -Encoding UTF8

    Write-SwarmStatus -Step "Archive" -Message "Transcript saved to $archiveFile" -Type Success

    # Save to agent memories
    Save-AgentMemory -Agent "Swarm" -Memory @{
        SessionId   = $sessionId
        Query       = $Query
        Duration    = $totalDuration
        TaskCount   = $executionTasks.Count
        SuccessRate = "$successCount/$($executionTasks.Count)"
        ArchiveFile = $archiveFile
    }

    # =========================================================================
    # THE END
    # =========================================================================
    Show-TheEndBanner

    # Final output
    Write-Host ""
    Write-Host "=" * 80 -ForegroundColor Green
    Write-Host "  FINAL ANSWER" -ForegroundColor Green
    Write-Host "=" * 80 -ForegroundColor Green
    Write-Host ""
    Write-Host $step4Result.Response -ForegroundColor White
    Write-Host ""

    return @{
        Success      = $true
        SessionId    = $sessionId
        Query        = $Query
        FinalAnswer  = $step4Result.Response
        Summary      = $step5Result.Response
        Duration     = $totalDuration
        ArchiveFile  = $archiveFile
        Transcript   = $transcript
    }
}

# ============================================================================
# YOLO MODE
# ============================================================================

function Enable-YoloMode {
    $script:YoloMode = $true
    Write-Host "YOLO Mode ENABLED - Fast & Dangerous!" -ForegroundColor Red
    Write-Host "Concurrency: 10 | Safety: OFF | Retries: 1 | Timeout: 15s" -ForegroundColor Yellow
}

function Disable-YoloMode {
    $script:YoloMode = $false
    Write-Host "YOLO Mode DISABLED - Standard Mode Active" -ForegroundColor Green
}

function Get-YoloStatus {
    return @{
        YoloMode = $script:YoloMode
        Settings = Get-CurrentSettings
    }
}

# ============================================================================
# MODULE EXPORTS
# ============================================================================

Export-ModuleMember -Function @(
    # Main Swarm
    'Invoke-AgentSwarm'

    # Agent Functions
    'Get-AgentModel'
    'Get-AgentSpec'
    'Get-AgentMemory'
    'Save-AgentMemory'
    'Invoke-AgentTask'

    # Queue Management
    'Add-ToSmartQueue'
    'Add-BatchToSmartQueue'
    'Get-QueueStatus'
    'Get-SmartQueueStatus'
    'Clear-SmartQueue'
    'Clear-QueueResults'
    'Get-QueueResults'

    # Parallel Execution
    'Start-QueueProcessor'
    'Invoke-ParallelSwarmExecution'
    'Invoke-ParallelClassification'

    # Prompt Optimization
    'Get-PromptComplexity'
    'Optimize-PromptAuto'

    # YOLO Mode
    'Enable-YoloMode'
    'Disable-YoloMode'
    'Get-YoloStatus'

    # Utilities
    'Test-OllamaConnection'
    'Show-TheEndBanner'
)
