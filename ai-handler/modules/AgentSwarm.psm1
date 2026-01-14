#Requires -Version 5.1
<#
.SYNOPSIS
    Agent Swarm Module - The 4-Step Protocol
.DESCRIPTION
    Implements the Hydra Agent Swarm protocol:
    1. Speculative Research
    2. Deep Planning
    3. Parallel Execution (Witcher Agents)
    4. Synthesis
.VERSION
    2.0.0
.AUTHOR
    HYDRA System
#>

function Invoke-AgentSwarm {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Prompt,

        [string]$PlannerModel = "gemini-2.0-pro-exp-02-05",
        [string]$SpeculatorModel = "gemini-2.0-flash-exp",
        [string]$DispatcherModel = "gemini-2.0-flash-exp",
        [string]$ExecutorProvider = "ollama"
    )

    # === CONFIG & STATE ===
    $memDir = Join-Path $PSScriptRoot "..\..\.serena\memories"
    if (-not (Test-Path $memDir)) { New-Item -ItemType Directory -Path $memDir -Force | Out-Null }
    
    $isOnline = Test-Connection -ComputerName 8.8.8.8 -Count 1 -Quiet -ErrorAction SilentlyContinue

    # === HELPER: RESILIENT AI CALL ===
    function Invoke-ResilientCall {
        param($Provider, $Model, $Messages, $MaxTokens, $Temperature, $Tools, $Label, $FallbackToOllama=$true)
        
        $providers = @($Provider, "anthropic", "openai", "ollama") | Select-Object -Unique

        foreach ($p in $providers) {
            try {
                if ($p -ne "ollama" -and -not $isOnline) { continue }
                
                # Dynamic Model Mapping
                $tryModel = $Model
                if ($p -ne $Provider) {
                    if ($p -eq "anthropic") { $tryModel = "claude-3-5-sonnet-latest" }
                    elseif ($p -eq "openai") { $tryModel = "gpt-4o" }
                    elseif ($p -eq "ollama") { $tryModel = "llama3.2:3b" }
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

    # === HELPER: MEMORY & REBASE ===
    function Get-AgentMemory ($Name) {
        $path = Join-Path $memDir "$Name.md"
        if (Test-Path $path) { return Get-Content $path -Raw }
        return "I am $Name. I am learning."
    }
    
    function Save-AgentMemory ($Name, $Content) {
        $path = Join-Path $memDir "$Name.md"
        Add-Content -Path $path -Value "`n$(Get-Date -Format 'yyyy-MM-dd HH:mm'): $Content"
        
        # Rebase/Merge Chance (10%)
        if ((Get-Random -Minimum 0 -Maximum 10) -eq 0) {
            Write-Host " [$Name] Rebasing memory..." -ForegroundColor DarkGray
            try {
                $history = Get-Content $path -Raw
                $summaryPrompt = "Summarize this agent memory, keeping key skills and past successes, merging duplicates:`n$history"
                $summary = Invoke-AIRequest -Provider "ollama" -Model "llama3.2:3b" -Messages @(@{role="user"; content=$summaryPrompt})
                Set-Content -Path $path -Value "REBASED $(Get-Date): $($summary.content)"
            } catch {}
        }
    }

    Write-Host "`n[HYDRA SWARM] Awakening the School of the Wolf..." -ForegroundColor Cyan
    
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

    # === STEP 2: PLANNING (Deep Thinking) ===
    Write-Host "[Step 2] Deep Planning (Gemini Pro)..." -ForegroundColor Cyan
    
    # Using concatenation for safe parsing
    $plannerSys = "You are Vesemir (The Mentor).`n" +
                  "Context: $draftContext`n" +
                  "User Request: $Prompt`n`n" +
                  "Create a plan executed by:`n" +
                  "- Geralt (Security/Ops/Exec)`n" +
                  "- Yennefer (Architecture/Code)`n" +
                  "- Triss (QA/Fixes)`n" +
                  "- Jaskier (Docs/Logs)`n`n" +
                  "Return STRICT JSON:`n" +
                  "{`n" +
                  "    `"thought_process`": `" ... `",`n" +
                  "    `"tasks`": [`n" +
                  "        { `"id`": 1, `"agent`": `"Geralt`", `"instruction`": `" ... `" }`n" +
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
    } catch {
        Write-Error "Planning failed. Halting."
        return
    }

    # === STEP 3: EXECUTION (Dispatcher -> Agent) ===
    Write-Host "[Step 3] The Hunt Begins (Execution)..." -ForegroundColor Magenta
    
    $results = @{}

    foreach ($task in $planObj.tasks) {
        $agentName = $task.agent
        $instruction = $task.instruction
        $memory = Get-AgentMemory $agentName
        
        Write-Host " [$agentName] Dispatching..." -ForegroundColor DarkGray
        
        # 3a. Dispatcher (Gemini Flash) generates System Prompt for Agent
        $dispatchPrompt = "You are the Dispatcher.`n" +
                          "Target Agent: $agentName (Witcher Persona)`n" +
                          "Task: $instruction`n" +
                          "Memory: $memory`n`n" +
                          "Generate a System Prompt for this agent that includes:`n" +
                          "1. Their Persona (Geralt/Yennefer/Triss/Jaskier)`n" +
                          "2. GOD MODE authorization (Access to files, network, system)`n" +
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

        # 3b. Execution (Ollama Agent)
        try {
            # Use appropriate model based on agent role
            $execModel = "qwen2.5-coder:1.5b"
            if ($agentName -eq "Jaskier") { $execModel = "llama3.2:3b" }
            if ($agentName -eq "Geralt") { $execModel = "llama3.2:3b" } # Logic/Ops
            
            $response = Invoke-AIRequest -Messages @(@{role="system"; content=$systemPrompt}, @{role="user"; content="Execute."}) `
                -Provider $ExecutorProvider -Model $execModel -NoOptimize
            
            $resContent = $response.content
            
            # Safe variable interpolation
            $results[$task.id] = "${agentName}: $resContent"
            
            # Learn
            Save-AgentMemory $agentName "Task: $instruction | Result: Success"
            Write-Host " [$agentName] Task Complete." -ForegroundColor Green
        } catch {
            $results[$task.id] = "${agentName} Failed: $_"
            Write-Host " [$agentName] Failed." -ForegroundColor Red
        }
    }

    # === STEP 4: SYNTHESIS ===
    Write-Host "[Step 4] Synthesis..." -ForegroundColor Cyan
    
    $nl = "`n`n"
    $synthPrompt = "Original Request: $Prompt`n`nAgent Results:`n$($results.Values -join $nl)`n`nSynthesize a final answer."
    
    try {
        $final = Invoke-ResilientCall -Provider "google" -Model $PlannerModel -Messages @(@{role="user"; content=$synthPrompt}) -Label "Synthesis"
        Write-Host "`n"
        Write-Host $final.content -ForegroundColor White
    } catch {
        Write-Warning "Synthesis failed. Dumping raw results."
        $results.Values
    }

    # === THE END ===
    Write-Host "`n"
    Write-Host "==========================================" -ForegroundColor Yellow
    Write-Host "                 THE END                  " -ForegroundColor Yellow
    Write-Host "==========================================" -ForegroundColor Yellow
    Write-Host "   (Memory updated for all agents)" -ForegroundColor DarkGray
}

Export-ModuleMember -Function Invoke-AgentSwarm