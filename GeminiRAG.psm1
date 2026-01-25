# GeminiRAG.psm1 - Local Vector Database for GeminiHydra
# Uses Ollama for embeddings and Python for similarity calculation.

$MemoryPath = "$PSScriptRoot\.serena\rag\memory_bank.json"

function Initialize-RAG {
    $dir = Split-Path $MemoryPath
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    if (-not (Test-Path $MemoryPath)) { Set-Content -Path $MemoryPath -Value "[]" }
}

function Get-Embedding {
    param([string]$Text, [string]$Model = "mxbai-embed-large")
    
    $body = @{
        model = $Model
        prompt = $Text
    } | ConvertTo-Json -Compress

    try {
        # Using the standard Ollama API endpoint
        $response = Invoke-RestMethod -Uri "http://localhost:11434/api/embeddings" -Method Post -Body $body -ContentType "application/json" -ErrorAction Stop
        return $response.embedding
    } catch {
        Write-Warning "Ollama Embedding Failed. Is Ollama running? Do you have '$Model' pulled? (ollama pull $Model)"
        return $null
    }
}

function Add-Memory {
    <#
    .SYNOPSIS
        Embeds and saves text to the local vector store.
    #>
    param(
        [Parameter(Mandatory=$true)]
        [string]$Content,
        [hashtable]$Metadata = @{}
    )
    
    Initialize-RAG
    
    Write-Host "Generating embedding..." -NoNewline
    $vector = Get-Embedding -Text $Content
    if (-not $vector) { Write-Host " [FAILED]" -ForegroundColor Red; return }
    Write-Host " [OK]" -ForegroundColor Green

    $newEntry = @{
        id = [Guid]::NewGuid().ToString()
        content = $Content
        embedding = $vector
        timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
        metadata = $Metadata
    }

    try {
        $jsonContent = Get-Content $MemoryPath -Raw
        if ([string]::IsNullOrWhiteSpace($jsonContent)) { $current = @() }
        else { $current = $jsonContent | ConvertFrom-Json }
        
        # Check if array
        if (-not ($current -is [Array])) { $current = @($current) }

        $current += $newEntry
        $current | ConvertTo-Json -Depth 5 -Compress | Set-Content $MemoryPath
        
        Write-Host "Memory Saved: $($newEntry.id)" -ForegroundColor Cyan
    } catch {
        Write-Error "Failed to save memory: $_"
    }
}

function Search-Memory {
    <#
    .SYNOPSIS
        Semantic search using local Python script.
    #>
    param(
        [Parameter(Mandatory=$true)]
        [string]$Query,
        [int]$TopK = 3
    )
    
    $vector = Get-Embedding -Text $Query
    if (-not $vector) { return }
    
    $vectorJson = $vector | ConvertTo-Json -Compress
    $script = "$PSScriptRoot\bin\calc_sim.py"
    
    if (-not (Test-Path $script)) {
        Write-Error "Python calculator script not found at $script"
        return
    }

    try {
        # Execute Python with UTF-8 encoding enforce
        $res = python $script $vectorJson $MemoryPath $TopK
        
        # Parse JSON output from Python
        $parsed = $res | ConvertFrom-Json
        return $parsed
    } catch {
        Write-Error "Search failed. Do you have Python installed? Error: $_"
    }
}

Export-ModuleMember -Function Add-Memory, Search-Memory, Initialize-RAG
