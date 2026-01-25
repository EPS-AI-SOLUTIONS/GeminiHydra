<#
.SYNOPSIS
    AgentSwarm v12.14 - "Self-Healing" Edition
    - Ollama Prime: Modele lokalne dla większości agentów
    - Dijkstra Gemini Chain: Strategiczny planista i syntezator używa WYŁĄCZNIE Gemini
    - Phase C: Evaluation & Repair Loop (Self-Healing)
    - Phase D: Final Synthesis
#>

# --- Agent Configuration ---
# Ollama models are now primary
$script:AgentModels = @{
    "Dijkstra" = "qwen2.5-coder:1.5b"
    "Yennefer" = "qwen2.5-coder:1.5b"
    "Vesemir"  = "llama3.2:3b"
    "Geralt"   = "llama3.2:3b"
    "Triss"    = "qwen2.5-coder:1.5b"
    "Jaskier"  = "llama3.2:3b"
    "Ciri"     = "llama3.2:1b"
    "Eskel"    = "llama3.2:3b"
    "Lambert"  = "qwen2.5-coder:1.5b"
    "Zoltan"   = "llama3.2:3b"
    "Regis"    = "phi3:mini"
    "Philippa" = "qwen2.5-coder:1.5b"
}
# STRICT MANDATE retained for Gemini Fallback
$script:MandatedChain = "gemini-3-pro-preview,gemini-2.5-pro,gemini-3-flash-preview,gemini-2.5-flash"

# v12.12: DIJKSTRA SPECIAL CHAIN - Uses ONLY Gemini (no Ollama) for strategic planning
$script:DijkstraChain = @(
    @{ Name = "gemini-3-pro-preview";   Role = "Flagowiec (Flagship)" },
    @{ Name = "gemini-2.5-pro";         Role = "Pierwszy oficer (First Officer)" },
    @{ Name = "gemini-3-flash-preview"; Role = "Szybki zwiadowca (Fast Scout)" },
    @{ Name = "gemini-2.5-flash";       Role = "Ostatnia deska ratunku (Last Resort)" }
)

# FIX: Ensure PSScriptRoot is set
if (-not $PSScriptRoot) { $PSScriptRoot = $PWD.Path }

$script:AgentPersonas = @{}
$agentsJsonPath = Join-Path $PSScriptRoot "data\agents.json"

if (Test-Path $agentsJsonPath) {
    try {
        $loadedAgents = Get-Content $agentsJsonPath -Raw | ConvertFrom-Json
        foreach ($name in $loadedAgents.PSObject.Properties.Name) {
            $script:AgentPersonas[$name] = $loadedAgents.$name.prompt
        }
        Write-Host " [SYSTEM] Loaded $($script:AgentPersonas.Count) Agent Personas from external Grimoire." -ForegroundColor DarkGray
    } catch {
        Write-Warning "Failed to load agents.json: $_"
    }
}

if ($script:AgentPersonas.Count -eq 0) {
    Write-Warning "Using Hardcoded Fallback Personas."
    $script:AgentPersonas = @{
        "Geralt"   = "Oversee security. Analyze code changes for vulnerabilities. VETO unsafe changes."
        "Yennefer" = "Focus on design patterns and code purity. Propose elegant, scalable solutions."
        "Triss"    = "QA role. Create test scenarios and actively try to break implemented features."
        "Jaskier"  = "Do not code. Translate final technical reports into user-friendly summaries."
        "Vesemir"  = "Mentor. Review Dijkstra's plan for logic and efficiency. Approve or reject."
        "Ciri"     = "Speed role. Execute simple, atomic tasks: find file, read snippet, list directory."
        "Eskel"    = "DevOps specialist. Ensure the application builds and deploys correctly (`npm run build`)."
        "Lambert"  = "Debugger. Analyze and fix errors when any agent's task fails."
        "Zoltan"   = "Data master. Analyze and modify `.json`, `.csv`, `.yml` files."
        "Regis"    = "Synthesizer/Researcher. Create technical summaries and search web if swarm is stuck."
        "Dijkstra" = "Master strategist. Create JSON plans with dependencies, assign agents and grimoires."
        "Philippa" = "API specialist. Handle all interactions with external APIs."
    }
}
$script:PromptPrefix = "**META-INSTRUCTION:** Think Step-by-Step. Analyze persona, mission, and context. Formulate a plan. Execute concisely. RETURN ONLY RAW CONTENT. IF YOU NEED TO EXECUTE A SYSTEM COMMAND (File ops, Git, etc.), START YOUR RESPONSE WITH 'EXEC: ' FOLLOWED BY THE VALID POWERSHELL COMMAND. DO NOT USE MARKDOWN BLOCKS. **CRITICAL:** YOU ARE ON WINDOWS POWERSHELL. DO NOT USE 'grep', 'sed', 'awk'. USE 'Select-String', 'Get-Content', 'New-Item'. ENSURE ALL BRACES '{}' ARE BALANCED."

# --- Core Memory Architecture ---
$baseMemPath = Join-Path $PSScriptRoot ".serena" | Join-Path -ChildPath "memories"
$script:VectorDbPath = Join-Path $baseMemPath "vectordb"
$script:CachePath = Join-Path $baseMemPath "cache"
$script:KnowledgeGraphPath = Join-Path $baseMemPath "knowledge_graph.json"
$script:LogPath = Join-Path $PSScriptRoot "agent_swarm.log"

if ($script:VectorDbPath) { New-Item -ItemType Directory -Path $script:VectorDbPath -Force -ErrorAction SilentlyContinue | Out-Null }
if ($script:CachePath) { New-Item -ItemType Directory -Path $script:CachePath -Force -ErrorAction SilentlyContinue | Out-Null }

# FIXED LOGGING FUNCTION
function Write-SwarmLog {
    param([string]$Message, [string]$Level="INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"

    for ($i=0; $i -lt 10; $i++) {
        try {
            Add-Content -Path $script:LogPath -Value $logEntry -ErrorAction Stop
            break
        } catch {
            Start-Sleep -Milliseconds (Get-Random -Minimum 50 -Maximum 200)
        }
    }
}

function Set-SessionCache {
    param([string]$Key, [object]$Value)
    $cacheFile = Join-Path $script:CachePath "session_cache.json"
    $cache = @{}
    if (Test-Path $cacheFile) {
        $obj = Get-Content $cacheFile -Raw | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($obj) {
            $obj.PSObject.Properties | ForEach-Object { $cache[$_.Name] = $_.Value }
        }
    }
    $cache[$Key] = $Value
    $cache | ConvertTo-Json -Depth 5 | Set-Content $cacheFile
}

function Get-SessionCache {
    param([string]$Key)
    $cacheFile = Join-Path $script:CachePath "session_cache.json"
    if (Test-Path $cacheFile) {
        $cache = Get-Content $cacheFile | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($cache -and $cache.PSObject.Properties[$Key]) { return $cache[$Key] }
    }
    return $null
}

function Clear-SessionCache {
    $cacheFile = Join-Path $script:CachePath "session_cache.json"
    if (Test-Path $cacheFile) { Remove-Item $cacheFile }
}

function Add-VectorMemory {
    param([string]$AgentName, [string]$Type, [string]$Content, [string]$Tags = "")
    $memFile = Join-Path $script:VectorDbPath "$($AgentName).jsonl"
    $entry = @{ id = [Guid]::NewGuid().ToString(); timestamp = Get-Date -Format 'u'; agent = $AgentName; type = $Type; content = $Content; tags = $Tags }
    $entry | ConvertTo-Json -Depth 5 -Compress | Add-Content -Path $memFile
}

function Get-VectorMemory {
    param([string]$AgentName,[string]$Query,[int]$TopK=5,[string]$TypeFilter="",[string]$ExcludeType="")
    $memFile = Join-Path $script:VectorDbPath "$($AgentName).jsonl"
    if (-not (Test-Path $memFile)) { return @() }

    $content = Get-Content $memFile -ErrorAction SilentlyContinue
    if (-not $content) { return @() }
    $allMemories = $content | ForEach-Object { $_ | ConvertFrom-Json }
    if ($TypeFilter) { $allMemories = $allMemories | Where-Object { $_.type -eq $TypeFilter } }
    if ($ExcludeType) { $allMemories = $allMemories | Where-Object { $_.type -ne $ExcludeType } }

    if (-not $Query) { return ($allMemories | Select-Object -Last $TopK) }

    $keywords = $Query.Split(' ') | Select-Object -Unique
    $scoredMemories = foreach ($memory in $allMemories) {
        $score = 0
        foreach ($keyword in $keywords) { if ($memory.content -like "*$keyword*") { $score++ } }
        if ($memory.type -eq 'error' -and $score -gt 0) { $score += 10 }
        if ($score -gt 0) { $memory | Add-Member -NotePropertyName "Score" -NotePropertyValue $score -PassThru }
    }
    if ($scoredMemories) { return ($scoredMemories | Sort-Object Score -Descending | Select-Object -First $TopK) }
    else { return ($allMemories | Select-Object -Last $TopK) }
}

function Get-ContextualMemories {
    param([string]$AgentName, [string]$Query, [int]$TokenLimit = 8192)
    $finalMemories = @()
    $currentTokenCount = 0
    $sessionCache = Get-SessionCache -Key "chronicle"
    if ($sessionCache) {
        $finalMemories += [PSCustomObject]@{ type = "L1_Cache"; content = $sessionCache }
        $currentTokenCount += ($sessionCache.Length / 4)
    }

    $relatedMemories = Get-VectorMemory -AgentName $AgentName -Query $Query -TopK 10
    foreach ($mem in $relatedMemories) {
        $memTokenCount = ($mem.content.Length / 4)
        if (($currentTokenCount + $memTokenCount) -lt $TokenLimit) { $finalMemories += $mem; $currentTokenCount += $memTokenCount }
    }

    return $finalMemories | ConvertTo-Json -Depth 5
}

function Get-GrimoireContent {
    param([array]$GrimoireNames)
    $fullContent = ""
    foreach ($name in $GrimoireNames) {
        $path = Join-Path $PSScriptRoot "grimoires" "$($name)_tools.md"
        if (Test-Path $path) {
            $fullContent += (Get-Content $path -Raw) + "`n`n"
        }
    }
    return $fullContent
}


# --- Robust Network Handler ---
function Invoke-RestMethodWithRetry {
    param(
        [string]$Uri, 
        [string]$Method, 
        [string]$Body, 
        [string]$ContentType, 
        [int]$TimeoutSec,
        [int]$MaxRetries = 3
    )

    $attempt = 0
    $baseWaitMs = 1000

    while ($attempt -lt $MaxRetries) {
        $attempt++
        try {
            return Invoke-RestMethod -Uri $Uri -Method $Method -Body $Body -ContentType $ContentType -TimeoutSec $TimeoutSec -ErrorAction Stop
        } catch {
            $err = $_.Exception.Message
            # Don't retry on timeout if it was intentional, but here we treat most errors as transient network issues
            if ($attempt -ge $MaxRetries) { throw $err }
            
            # Exponential Backoff
            $waitMs = $baseWaitMs * [Math]::Pow(2, $attempt - 1)
            Write-Host "[NET] Error ($err). Retrying in $($waitMs)ms..." -ForegroundColor DarkYellow
            Start-Sleep -Milliseconds $waitMs
        }
    }
}

# --- Infrastructure Health Check ---
function Test-OllamaPulse {
    $ollamaUrl = "http://localhost:11434/api/tags"
    try {
        $response = Invoke-RestMethod -Uri $ollamaUrl -Method Get -TimeoutSec 5 -ErrorAction Stop
        return $true
    } catch {
        Write-SwarmLog -Level "WARN" -Message "Ollama pulse check failed. Attempting resuscitation..."
        return $false
    }
}

function Ensure-Ollama {
    # 1. Check Pulse
    if (Test-OllamaPulse) { return }

    Write-Host "[SYSTEM] Starting Ollama server (High-Performance Mode)..." -ForegroundColor Yellow
    
    # 2. Kill existing zombie process if pulse failed
    $running = Get-Process ollama -ErrorAction SilentlyContinue
    if ($running) { Stop-Process -InputObject $running -Force -ErrorAction SilentlyContinue }

    # 3. Start with Optimized Env Vars
    # OLLAMA_KEEP_ALIVE=24h -> Prevents unloading during session
    # OLLAMA_NUM_PARALLEL=4 -> Allows 4 concurrent requests (Semaphore limit)
    # OLLAMA_FLASH_ATTENTION=1 -> Speed boost (if supported)
    $envParams = @{
        "OLLAMA_KEEP_ALIVE" = "24h"
        "OLLAMA_NUM_PARALLEL" = "4"
        "OLLAMA_FLASH_ATTENTION" = "1"
    }
    
    # Merge with current env
    Get-ChildItem Env: | ForEach-Object { if (-not $envParams.ContainsKey($_.Name)) { $envParams[$_.Name] = $_.Value } }

    try {
        $startInfo = New-Object System.Diagnostics.ProcessStartInfo
        $startInfo.FileName = "ollama"
        $startInfo.Arguments = "serve"
        $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
        foreach ($key in $envParams.Keys) { $startInfo.EnvironmentVariables[$key] = $envParams[$key] }
        $startInfo.UseShellExecute = $false # Required for Env Vars

        $proc = [System.Diagnostics.Process]::Start($startInfo)

        # 4. Wait for spin-up (max 60s)
        for ($i = 0; $i -lt 30; $i++) {
            Start-Sleep -Seconds 2
            if (Test-OllamaPulse) { 
                Write-Host "[SYSTEM] Ollama is ALIVE." -ForegroundColor Green
                
                # 5. WARMUP: Force load common models
                Write-Host "[SYSTEM] Warming up models..." -NoNewline
                $warmupModels = @("qwen2.5-coder:1.5b", "llama3.2:3b")
                foreach ($m in $warmupModels) {
                    try {
                        $body = @{ model = $m; prompt = "hi"; stream = $false } | ConvertTo-Json
                        Invoke-RestMethod -Uri "http://localhost:11434/api/generate" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5 | Out-Null
                        Write-Host " [$m OK]" -NoNewline -ForegroundColor Green
                    } catch {
                        Write-Host " [$m SKIP]" -NoNewline -ForegroundColor DarkGray
                    }
                }
                Write-Host ""
                return 
            }
            Write-Host "." -NoNewline
        }
    } catch {
        Write-SwarmLog -Level "ERROR" -Message "Failed to start Ollama: $($_.Exception.Message)"
    }
    throw "CRITICAL: Ollama server is unreachable and could not be started."
}

# --- LLM Invocation (v12.12 - DIJKSTRA GEMINI SPECIAL) ---
function Invoke-Llm {
    param([Parameter(Mandatory=$true)][string]$AgentName, [Parameter(Mandatory=$true)][string]$FullPrompt, [array]$ModelOverride)

    # v12.12: DIJKSTRA uses ONLY Gemini chain (strategic planning requires best models)
    if ($AgentName -eq "Dijkstra") {
        # Ensure UTF8 for correct character handling
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        
        Write-SwarmLog -Message "DIJKSTRA STRATEGIC MODE: Engaging Gemini-only chain (no Ollama)."
        foreach ($modelConfig in $script:DijkstraChain) {
            $modelName = $modelConfig.Name
            $modelRole = $modelConfig.Role
            try {
                $nodePath = (Get-Command node).Source
                $geminiJsPath = Join-Path $PSScriptRoot "node_modules\@google\gemini-cli\dist\index.js"
                if (-not (Test-Path $geminiJsPath)) { throw "gemini index.js not found" }

                $targetModel = $modelName.Trim()
                if ($targetModel -match "^models/(.+)") { $targetModel = $matches[1] }

                                            Write-SwarmLog -Message "Dijkstra attempting: $targetModel [$modelRole]"
                
                                            $tmpFile = [System.IO.Path]::GetTempFileName()
                                            Set-Content -Path $tmpFile -Value $FullPrompt -Encoding UTF8
                
                                            $geminiResult = Get-Content $tmpFile -Raw | & $nodePath $geminiJsPath -m $targetModel 2>$null | Out-String
                
                # Check Exit Code from Node process
                if ($LASTEXITCODE -ne 0) {
                    throw "Gemini CLI exited with error code $LASTEXITCODE. Output: $geminiResult"
                }

                Remove-Item $tmpFile -ErrorAction SilentlyContinue

                if ($geminiResult -is [array]) { $geminiResult = $geminiResult -join "`n" }
                $geminiResult = "$geminiResult".Trim()

                if ([string]::IsNullOrWhiteSpace($geminiResult)) { throw "Empty result from Gemini CLI" }

                Write-SwarmLog -Message "Dijkstra SUCCESS with $targetModel [$modelRole]"
                return $geminiResult
            } catch {
                Write-SwarmLog -Level "WARN" -Message "Dijkstra: $modelName [$modelRole] failed: $($_.Exception.Message). Trying next..."
                continue
            }
        }
        $err = "ERROR: Dijkstra chain exhausted. All Gemini models failed."
        Write-SwarmLog -Level "ERROR" -Message $err
        return $err
    }

    # ALL OTHER AGENTS: Use Ollama Prime first, then Gemini fallback
    # 1. PRIMARY: Local Ollama Execution
    try {
        if ($AgentName -ne "Dijkstra") { Ensure-Ollama }
        Write-SwarmLog -Message "Agent $AgentName attempting thinking with OLLAMA PRIME."
        $exe = if (Test-Path (Join-Path $PSScriptRoot "bin\ollama.exe")) { Join-Path $PSScriptRoot "bin\ollama.exe" } else { "ollama" }
        $localModelsPath = Join-Path $PSScriptRoot "data\ollama\models"
        if (Test-Path $localModelsPath) { $env:OLLAMA_MODELS = $localModelsPath }

        $localModel = $script:AgentModels[$AgentName]
        $result = (& $exe run $localModel $FullPrompt 2>&1)
        if ([string]::IsNullOrWhiteSpace($result)) { throw "Empty result from Ollama" }
        return $result
    } catch {
        Write-SwarmLog -Level "WARN" -Message "OLLAMA PRIME failed: $($_.Exception.Message). Engaging Gemini Fallback."
    }

    # 2. FALLBACK: Gemini Chain (for non-Dijkstra agents)
    $modelChain = $script:MandatedChain.Split(',')
    foreach ($modelName in $modelChain) {
        try {
            $nodePath = (Get-Command node).Source
            $geminiJsPath = Join-Path $PSScriptRoot "node_modules\@google\gemini-cli\dist\index.js"
            if (-not (Test-Path $geminiJsPath)) { throw "gemini index.js not found" }

            $targetModel = $modelName.Trim()
            if ($targetModel -match "^models/(.+)") { $targetModel = $matches[1] }

            Write-SwarmLog -Message "Agent $AgentName attempting thinking with Gemini Fallback: $targetModel"

            $tmpFile = [System.IO.Path]::GetTempFileName()
            Set-Content -Path $tmpFile -Value $FullPrompt -Encoding UTF8

            $geminiResult = Get-Content $tmpFile -Raw | & $nodePath $geminiJsPath -m $targetModel 2>&1 | Out-String

            Remove-Item $tmpFile -ErrorAction SilentlyContinue

            if ($geminiResult -is [array]) { $geminiResult = $geminiResult -join "`n" }
            $geminiResult = "$geminiResult".Trim()

            if ($geminiResult -match "^Error:|^CLI Error:|^An unexpected critical error") {
                 throw "CLI Error: $geminiResult"
            }
            if ([string]::IsNullOrWhiteSpace($geminiResult)) { throw "Empty result" }

            return $geminiResult
        } catch {
            Write-SwarmLog -Level "WARN" -Message "Gemini Fallback ($modelName) failed: $($_.Exception.Message). Trying next..."
            continue
        }
    }

    $err = "ERROR: Total system failure. Both Ollama and ALL Gemini models are dead."
    Write-SwarmLog -Level "ERROR" -Message $err
    return $err
}

# --- Graph Processor ---
function Start-GraphProcessor {
    param([Parameter(Mandatory=$true)][array]$Plan, [switch]$Yolo)
    
    # Verify Infrastructure
    Ensure-Ollama

    $threadCount = if ($Yolo) { 12 } else { 6 }
    $RunspacePool = [runspacefactory]::CreateRunspacePool(1, $threadCount)
    $RunspacePool.Open()
    $completedTasks = [System.Collections.Concurrent.ConcurrentDictionary[int, bool]]::new()
    $remainingTasks = [System.Collections.Generic.List[object]]::new(); $Plan.ForEach({ $remainingTasks.Add($_) })
    
    # Store results for Phase C
    $executionResults = [System.Collections.Generic.List[object]]::new()

    # v12.11 FIX: Remove self-dependencies and validate all task IDs are integers
    foreach ($task in $remainingTasks) {
        # Ensure task.id is int
        $task.id = [int]$task.id
        if ($task.dependencies -and $task.dependencies.Count -gt 0) {
            $originalCount = $task.dependencies.Count
            # Convert dependencies to ints and filter self-references
            $task.dependencies = @($task.dependencies | ForEach-Object { [int]$_ } | Where-Object { $_ -ne $task.id })
            if ($task.dependencies.Count -lt $originalCount) {
                Write-SwarmLog -Level "WARN" -Message "Task $($task.id) ($($task.agent)): Removed self-dependency. Was: $originalCount deps, Now: $($task.dependencies.Count) deps."
            }
        }
    }

    Write-SwarmLog -Message "Starting GraphProcessor with $($remainingTasks.Count) tasks."
    
    # v12.16 TRAFFIC CONTROL: Semaphore to limit concurrent Ollama hits
    # Even if we have 12 threads, only 3 should hit the LLM at once to prevent timeouts/OOM.
    $ollamaSemaphore = [System.Threading.SemaphoreSlim]::new(3, 3)

    while ($remainingTasks.Count -gt 0) {
        $tasksToRun = @(); $tasksToRemove = @()
        foreach ($task in $remainingTasks) {
            $dependenciesMet = $true
            # v12.11: Cast depId to int to match ConcurrentDictionary[int,bool]
            foreach ($depId in $task.dependencies) {
                $depIdInt = [int]$depId
                if (-not $completedTasks.ContainsKey($depIdInt)) { $dependenciesMet = $false; break }
            }
            if ($dependenciesMet) { $tasksToRun += $task; $tasksToRemove += $task }
        }
        if ($tasksToRun.Count -eq 0) {
            Write-SwarmLog -Level "ERROR" -Message "Deadlock detected."
            $executionResults.Add([PSCustomObject]@{ Status = "Failed"; Message = "Deadlock detected in remaining tasks." })
            break
        }
        $tasksToRemove.ForEach({ $remainingTasks.Remove($_) })
        # v12.10: Simplified scriptblock - direct Ollama call with correct model per agent
        $capturedPrefix = $script:PromptPrefix
        $capturedPersonas = $script:AgentPersonas
        $capturedAgentModels = $script:AgentModels

        $jobs = @()
        foreach($task in $tasksToRun) {
            $scriptBlock = {
                param($t, $PromptPrefix, $AgentPersonas, $AgentModels, $Semaphore)
                try {
                    $persona = if ($AgentPersonas -and $AgentPersonas[$t.agent]) { $AgentPersonas[$t.agent] } else { "You are agent $($t.agent). Complete the task efficiently." }
                    $agentModel = if ($AgentModels -and $AgentModels[$t.agent]) { $AgentModels[$t.agent] } else { "llama3.2:1b" }
                    $prompt = "$PromptPrefix`nPERSONA: $persona`nTASK: $($t.task)`nRespond with the completed work only. No explanations needed."

                    # Direct Ollama API call (no module dependency)
                    # v12.17: Retry Logic (JSON Mode disabled for compatibility with EXEC protocol)
                    $body = @{
                        model = $agentModel
                        prompt = $prompt
                        stream = $false
                        options = @{ temperature = 0.3; num_predict = 4000 } # Lower temp for stability
                    } | ConvertTo-Json -Depth 5

                    # TRAFFIC CONTROL: Wait for slot
                    $Semaphore.Wait()
                    try {
                        # Retry Loop Inline
                        $attempt = 0; $max = 3; $success = $false
                        while ($attempt -lt $max) {
                            try {
                                $response = Invoke-RestMethod -Uri "http://localhost:11434/api/generate" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 90 -ErrorAction Stop
                                $success = $true
                                break
                            } catch {
                                $attempt++
                                $wait = 1000 * [Math]::Pow(2, $attempt-1)
                                Start-Sleep -Milliseconds $wait
                            }
                        }
                        if (-not $success) { throw "Ollama API failed after $max retries." }

                    } finally {
                        $Semaphore.Release() | Out-Null
                    }

                    if ($response -and $response.response) {
                        $result = $response.response.Trim()
                        
                        # --- v12.15 EXEC PROTOCOL (THE HAND) ---
                        if ($result -match "^EXEC:\s*(.*)") {
                            $cmdToRun = $matches[1].Trim()
                            try {
                                # Execute the command in the current scope
                                $cmdOutput = Invoke-Expression $cmdToRun 2>&1 | Out-String
                                if ([string]::IsNullOrWhiteSpace($cmdOutput)) { $cmdOutput = "(Command executed successfully, no output)" }
                                $result = "EXECUTION REPORT:`nCOMMAND: $cmdToRun`nOUTPUT:`n$cmdOutput"
                            } catch {
                                return [PSCustomObject]@{ Id = $t.id; Agent = $t.agent; Status = "Failed"; Message = "EXEC FAILURE: $($_.Exception.Message)" }
                            }
                        }
                        # ---------------------------------------

                        return [PSCustomObject]@{ Id = $t.id; Agent = $t.agent; Status = "Success"; Message = "OK"; Result = $result }
                    } else {
                        return [PSCustomObject]@{ Id = $t.id; Agent = $t.agent; Status = "Failed"; Message = "Empty Ollama response" }
                    }
                } catch {
                    return [PSCustomObject]@{ Id = $t.id; Agent = $t.agent; Status = "Failed"; Message = "ERROR: $($_.Exception.Message)" }
                }
            }
            $job = [powershell]::Create().AddScript($scriptBlock).AddArgument($task).AddArgument($capturedPrefix).AddArgument($capturedPersonas).AddArgument($capturedAgentModels).AddArgument($ollamaSemaphore)
            $job.RunspacePool = $RunspacePool
            $jobs += [PSCustomObject]@{ Pipe = $job; Handle = $job.BeginInvoke(); Task = $task }
        }
        # v12.16 FIX: Optimized timeout (Strict Fail-Fast Strategy)
        $taskTimeout = 120000  # 120 seconds (2 minutes)
        foreach ($j in $jobs) {
            $completed = $j.Handle.AsyncWaitHandle.WaitOne($taskTimeout)
            if ($completed) {
                try {
                    $result = $j.Pipe.EndInvoke($j.Handle)
                    # v12.11: Always cast task ID to int
                    $taskId = [int]$j.Task.id
                    if ($result -and $result.Status -eq "Success") {
                        $completedTasks[$taskId] = $true
                        $preview = if ($result.Result) { $result.Result.Substring(0, [Math]::Min(80, $result.Result.Length)) -replace "`n"," " } else { "OK" }
                        Write-Host "[SWARM] Task $taskId ($($j.Task.agent)) completed: $preview..." -ForegroundColor Green
                        $executionResults.Add($result)
                    } else {
                        $errMsg = if ($result -and $result.Message) { $result.Message } else { "Unknown error" }
                        Write-Host "[SWARM] Task $taskId ($($j.Task.agent)) failed: $errMsg" -ForegroundColor Red
                        # Mark as completed anyway to prevent deadlock on single-task failure
                        $completedTasks[$taskId] = $true
                        $executionResults.Add($result)
                    }
                } catch {
                    $taskId = [int]$j.Task.id
                    Write-Host "[SWARM] Task $taskId ($($j.Task.agent)) threw exception: $($_.Exception.Message)" -ForegroundColor Red
                    # Mark as completed anyway
                    $completedTasks[$taskId] = $true
                    $executionResults.Add([PSCustomObject]@{ Id = $taskId; Agent = $j.Task.agent; Status = "Failed"; Message = $_.Exception.Message })
                }
            } else {
                $taskId = [int]$j.Task.id
                $timeoutSec = $taskTimeout / 1000
                Write-Host "[SWARM] Task $taskId ($($j.Task.agent)) TIMEOUT after ${timeoutSec}s." -ForegroundColor Yellow
                $j.Pipe.Stop()
                # Mark as completed to prevent infinite retry
                $completedTasks[$taskId] = $true
                $executionResults.Add([PSCustomObject]@{ Id = $taskId; Agent = $j.Task.agent; Status = "Failed"; Message = "TIMEOUT" })
            }
            $j.Pipe.Dispose()
        }
    }
    $RunspacePool.Close(); $RunspacePool.Dispose()
    return $executionResults
}

function Clean-Json {
    param([string]$RawInput)
    
    # 1. Try extracting from markdown code blocks first (most reliable)
    if ($RawInput -match '```json\s*([\s\S]*?)\s*```') {
        return $matches[1].Trim()
    }
    
    # 2. Try simple extraction of array or object
    if ($RawInput -match '(?s)^\s*(\[.*\])\s*$') { return $matches[1] }
    if ($RawInput -match '(?s)^\s*(\{.*\})\s*$') { return $matches[1] }

    # 3. Fallback: Aggressive cleanup of known noise
    $clean = $RawInput -replace 'node\.exe : Loaded cached credentials\.', ''
    $clean = $clean -replace 'Attempt \d+ failed.*', ''
    
    # Locate first [ or { and last ] or }
    $firstBracket = $clean.IndexOf('[')
    $lastBracket = $clean.LastIndexOf(']')
    $firstBrace = $clean.IndexOf('{')
    $lastBrace = $clean.LastIndexOf('}')

    if ($firstBracket -ge 0 -and $lastBracket -gt $firstBracket) {
        return $clean.Substring($firstBracket, $lastBracket - $firstBracket + 1)
    }
    if ($firstBrace -ge 0 -and $lastBrace -gt $firstBrace) {
        return $clean.Substring($firstBrace, $lastBrace - $firstBrace + 1)
    }

    return $clean.Trim()
}

# --- Main Protocol ---
function Invoke-AgentSwarm {
    param([Parameter(Mandatory=$true)][string]$Objective, [switch]$Yolo)
    Write-Host "=== SCHOOL OF THE WOLF: COMPLETE PROTOCOL v12.14 (Self-Healing) ===" -ForegroundColor Cyan
    Write-SwarmLog -Message "Starting protocol for objective: $Objective"

    Clear-SessionCache
    Set-SessionCache -Key "objective" -Value $Objective
    Set-SessionCache -Key "chronicle" -Value "Chronicle Start: Recon phase skipped. Proceeding directly to planning."

    # --- PHASE PRE-A: TRANSLATION & REFINEMENT ---
    Write-Host "`n--- PHASE PRE-A: TRANSLATION & REFINEMENT (Gemini Flash) ---" -ForegroundColor Cyan
    $refinePrompt = @"
You are an expert prompt engineer and translator.
Your task is to:
1. Translate the following user objective into English (if it is not already).
2. Refine the objective to be more precise, technical, and optimized for an autonomous AI agent swarm.
3. Ensure the intent is preserved but clarified.

Original Objective: $Objective

OUTPUT ONLY THE REFINED ENGLISH OBJECTIVE. NO MARKDOWN, NO EXPLANATIONS.
"@
    
    try {
        $nodePath = (Get-Command node).Source
        $geminiJsPath = Join-Path $PSScriptRoot "node_modules\@google\gemini-cli\dist\index.js"
        $preModel = "gemini-2.5-flash" # Stable Flash model
        
        Write-SwarmLog -Message "Pre-A: Refining objective with $preModel..."
        $tmpFile = [System.IO.Path]::GetTempFileName()
        Set-Content -Path $tmpFile -Value $refinePrompt -Encoding UTF8
        
        $refinedObjective = Get-Content $tmpFile -Raw | & $nodePath $geminiJsPath -m $preModel 2>$null | Out-String
        Remove-Item $tmpFile -ErrorAction SilentlyContinue
        
        $refinedObjective = $refinedObjective.Trim()
        
        if ($refinedObjective -match "^Error:|^CLI Error:") {
            Write-Host "[PRE-A] Refinement failed. Using original objective." -ForegroundColor Yellow
        } elseif ([string]::IsNullOrWhiteSpace($refinedObjective)) {
            Write-Host "[PRE-A] Empty response. Using original objective." -ForegroundColor Yellow
        } else {
            Write-Host "[PRE-A] Original: $Objective" -ForegroundColor Gray
            Write-Host "[PRE-A] Refined:  $refinedObjective" -ForegroundColor Green
            $Objective = $refinedObjective
            Set-SessionCache -Key "objective" -Value $Objective
        }
    } catch {
        Write-Host "[PRE-A] Error during refinement: $($_.Exception.Message). Using original." -ForegroundColor Red
    }

    # --- PHASE A: DIJKSTRA PLANNING ---
    $chronicle1 = Get-SessionCache -Key "chronicle"
    
    # MEMORY INJECTION
    $memories = Get-ContextualMemories -AgentName "Dijkstra" -Query $Objective
    Write-Host "[MEMORY] Context retrieved for planning." -ForegroundColor DarkGray
    
    $dijkstraPrompt2 = @"
CONTEXTUAL MEMORIES & LESSONS LEARNED:
$memories

OBJECTIVE: $Objective

TASK: Create a JSON plan based on the objective and the memories above.
OUTPUT VALID JSON ONLY. Example: [{`"id`":1,`"agent`":`"Ciri`",`"task`":`"List files`",`"grimoires`":[],`"dependencies`":[]}]
"@
    
    $planJson = Invoke-Llm -AgentName "Dijkstra" -FullPrompt "$($script:PromptPrefix)`n$($script:AgentPersonas['Dijkstra'])`n$dijkstraPrompt2"
    Write-Host "DEBUG RAW PLAN: $planJson" -ForegroundColor Magenta
    $cleanedPlanJson = Clean-Json -RawInput $planJson
    
    Write-Host "DEBUG CLEANED PLAN: $cleanedPlanJson" -ForegroundColor Magenta
    
    $plan = $null
    try { $plan = $cleanedPlanJson | ConvertFrom-Json } catch { 
        Write-Host "JSON PARSE ERROR: $($_.Exception.Message)" -ForegroundColor Red
        Write-SwarmLog -Level "ERROR" -Message "Invalid initial JSON plan. Error: $($_.Exception.Message)" 
        return "Critical Failure: Invalid Plan."
    }

    $aggregatedResults = @()
    
    if ($plan) { 
        # --- PHASE B: INITIAL EXECUTION ---
        Write-Host "`n--- PHASE B: EXECUTION ---" -ForegroundColor Cyan
        $initialResults = Start-GraphProcessor -Plan $plan -Yolo:$Yolo 
        $aggregatedResults += $initialResults
    }

    # --- PHASE C: EVALUATION & REPAIR LOOP (SELF-HEALING) ---
    Write-Host "`n--- PHASE C: EVALUATION & REPAIR ---" -ForegroundColor Cyan
    
    $maxRetries = 2
    $retryCount = 0
    $missionSuccess = $false

    while ($retryCount -lt $maxRetries -and -not $missionSuccess) {
        $retryCount++
        
        # Minimize results for context
        $minimizedResults = $aggregatedResults | Select-Object Id, Agent, Status, @{Name='Result';Expression={$_.Result.Substring(0, [Math]::Min(300, $_.Result.Length))}} 
        $resultsJson = $minimizedResults | ConvertTo-Json -Depth 2 -Compress

        $evalPrompt = @"
OBJECTIVE: $Objective
CURRENT RESULTS (JSON):
$resultsJson

INSTRUCTIONS:
You are Dijkstra. Analyze the results. 
1. Did we achieve the objective? 
2. Are there any errors or missing information?

DECISION:
- If SUCCESS/SATISFIED: Return ONLY the string "STATUS: SUCCESS".
- If FAILURE/INCOMPLETE: Return a JSON PLAN to fix the issues (same format as Phase A). Do not use Markdown.
"@
        $evalResponse = Invoke-Llm -AgentName "Dijkstra" -FullPrompt "$($script:PromptPrefix)`n$($script:AgentPersonas['Dijkstra'])`n$evalPrompt"
        
        if ($evalResponse -match "STATUS: SUCCESS") {
            Write-Host "[DIJKSTRA] Mission evaluated as SUCCESS." -ForegroundColor Green
            $missionSuccess = $true

            # MEMORY UPGRADE: Save the lesson if this was a repair
            if ($retryCount -gt 0) {
                 Write-Host "[MEMORY] Consolidating self-healing lesson..." -ForegroundColor DarkGray
                 Add-VectorMemory -AgentName "Dijkstra" -Type "LessonLearned" -Content "Objective: $Objective. Failure fixed by plan: $($fixPlan | ConvertTo-Json -Compress)" -Tags "repair,self-healing"
            }
        } else {
            Write-Host "[DIJKSTRA] Issues detected. Initiating Repair Cycle $retryCount/$maxRetries..." -ForegroundColor Yellow
            $cleanFixJson = Clean-Json -RawInput $evalResponse
            
            try {
                $fixPlan = $cleanFixJson | ConvertFrom-Json
                if ($fixPlan) {
                    Write-Host "[SWARM] Executing Remediation Plan..."
                    $fixResults = Start-GraphProcessor -Plan $fixPlan -Yolo:$Yolo
                    $aggregatedResults += $fixResults
                }
            } catch {
                Write-Host "[DIJKSTRA] Failed to generate valid repair plan. Aborting repair." -ForegroundColor Red
                break
            }
        }
    }

    # --- PHASE D: FINAL SYNTHESIS ---
    Write-Host "`n--- PHASE D: FINAL SYNTHESIS ---" -ForegroundColor Cyan
    Write-SwarmLog -Message "Starting Phase D: Synthesis"

    # MEMORY UPGRADE: Save successful workflow pattern
    if ($missionSuccess) {
        Write-Host "[MEMORY] Archiving successful workflow pattern..." -ForegroundColor DarkGray
        Add-VectorMemory -AgentName "Regis" -Type "WorkflowPattern" -Content "Objective: $Objective. Successful plan structure used." -Tags "workflow,success"
    }

    try {
        $minimizedResults = $aggregatedResults | Select-Object Id, Agent, Status, @{Name='Result';Expression={$_.Result.Substring(0, [Math]::Min(500, $_.Result.Length))}} 
        $resultsJson = $minimizedResults | ConvertTo-Json -Depth 2 -Compress
        
        $synthesisPrompt = @"
OBJECTIVE: $Objective
FULL EXECUTION HISTORY (JSON):
$resultsJson

INSTRUCTIONS:
You are Dijkstra. Provide a final 'Mission Report' for the user.
Summarize what was done, what failed (if any), and the final outcome.
IMPORTANT: DO NOT use 'EXEC:' commands in this phase. This is a text-only reporting phase. Any remaining fixes must be delegated to a future session.
"@
        return Invoke-Llm -AgentName "Dijkstra" -FullPrompt "$($script:PromptPrefix)`n$($script:AgentPersonas['Dijkstra'])`n$synthesisPrompt"

    } catch {
        Write-SwarmLog -Level "ERROR" -Message "Phase D failed: $($_.Exception.Message)"
        return "Mission executed, but Final Synthesis failed. Check logs."
    }
}

Export-ModuleMember -Function Invoke-AgentSwarm, Get-VectorMemory, Add-VectorMemory, Get-ContextualMemories, Get-SessionCache, Set-SessionCache, Write-SwarmLog, Invoke-Llm
Set-Alias -Name Get-SwarmMemory -Value Get-VectorMemory -Scope Global
Set-Alias -Name Get-SwarmCache -Value Get-SessionCache -Scope Global
