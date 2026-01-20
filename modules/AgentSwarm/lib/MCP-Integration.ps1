#Requires -Version 5.1
<#
.SYNOPSIS
    MCP Integration helpers for AgentSwarm

.DESCRIPTION
    Provides integration with MCP servers:
    - Serena (@serena) - Code navigation and memory
    - Desktop Commander (@desktop-commander) - File/process operations
    - Playwright (@playwright) - Browser automation
#>

# ============================================================================
# SERENA INTEGRATION
# ============================================================================

function Invoke-SerenaFindSymbol {
    <#
    .SYNOPSIS
        Find a symbol using Serena MCP
    #>
    param(
        [Parameter(Mandatory)]
        [string]$Symbol,
        [string]$ProjectPath = $PWD
    )

    # This would call Serena MCP - placeholder for MCP tool call
    Write-Host "[Serena] Finding symbol: $Symbol in $ProjectPath" -ForegroundColor Magenta

    # In real MCP context, this would be:
    # @serena find_symbol $Symbol

    return @{
        Tool   = "serena"
        Action = "find_symbol"
        Symbol = $Symbol
        Path   = $ProjectPath
    }
}

function Invoke-SerenaReadFile {
    param(
        [Parameter(Mandatory)]
        [string]$FilePath
    )

    Write-Host "[Serena] Reading file: $FilePath" -ForegroundColor Magenta

    # Fallback to local read if Serena not available
    if (Test-Path $FilePath) {
        return Get-Content $FilePath -Raw
    }

    return $null
}

function Invoke-SerenaWriteMemory {
    param(
        [Parameter(Mandatory)]
        [string]$Key,
        [Parameter(Mandatory)]
        [object]$Value
    )

    Write-Host "[Serena] Writing memory: $Key" -ForegroundColor Magenta

    $memoryPath = Join-Path $PSScriptRoot "..\..\..\.serena\memories"
    if (-not (Test-Path $memoryPath)) {
        New-Item -ItemType Directory -Path $memoryPath -Force | Out-Null
    }

    $memoryFile = Join-Path $memoryPath "mcp_memory.json"
    $memories = @{}

    if (Test-Path $memoryFile) {
        $memories = Get-Content $memoryFile -Raw | ConvertFrom-Json -AsHashtable
    }

    $memories[$Key] = @{
        value     = $Value
        timestamp = (Get-Date).ToString("o")
    }

    $memories | ConvertTo-Json -Depth 10 | Set-Content $memoryFile

    return @{ Success = $true; Key = $Key }
}

# ============================================================================
# DESKTOP COMMANDER INTEGRATION
# ============================================================================

function Invoke-DesktopCommanderProcess {
    <#
    .SYNOPSIS
        Start a process via Desktop Commander MCP
    #>
    param(
        [Parameter(Mandatory)]
        [string]$Command,
        [string[]]$Arguments = @(),
        [string]$WorkingDirectory = $PWD
    )

    Write-Host "[Desktop Commander] Starting: $Command $($Arguments -join ' ')" -ForegroundColor Blue

    # Fallback to local execution
    try {
        $result = Start-Process -FilePath $Command -ArgumentList $Arguments `
            -WorkingDirectory $WorkingDirectory -PassThru -Wait -NoNewWindow

        return @{
            Tool       = "desktop-commander"
            Action     = "start_process"
            ExitCode   = $result.ExitCode
            Success    = $result.ExitCode -eq 0
        }
    }
    catch {
        return @{
            Tool    = "desktop-commander"
            Action  = "start_process"
            Error   = $_.Exception.Message
            Success = $false
        }
    }
}

function Invoke-DesktopCommanderReadFile {
    param(
        [Parameter(Mandatory)]
        [string]$FilePath
    )

    Write-Host "[Desktop Commander] Reading: $FilePath" -ForegroundColor Blue

    if (Test-Path $FilePath) {
        return Get-Content $FilePath -Raw
    }

    return $null
}

function Invoke-DesktopCommanderWriteFile {
    param(
        [Parameter(Mandatory)]
        [string]$FilePath,
        [Parameter(Mandatory)]
        [string]$Content
    )

    Write-Host "[Desktop Commander] Writing: $FilePath" -ForegroundColor Blue

    try {
        $Content | Set-Content -Path $FilePath -Encoding UTF8
        return @{ Success = $true; Path = $FilePath }
    }
    catch {
        return @{ Success = $false; Error = $_.Exception.Message }
    }
}

function Invoke-DesktopCommanderListDirectory {
    param(
        [string]$Path = $PWD
    )

    Write-Host "[Desktop Commander] Listing: $Path" -ForegroundColor Blue

    return Get-ChildItem -Path $Path
}

# ============================================================================
# PLAYWRIGHT INTEGRATION
# ============================================================================

function Invoke-PlaywrightNavigate {
    <#
    .SYNOPSIS
        Navigate browser via Playwright MCP
    #>
    param(
        [Parameter(Mandatory)]
        [string]$Url
    )

    Write-Host "[Playwright] Navigating to: $Url" -ForegroundColor Green

    # This would call Playwright MCP - placeholder
    return @{
        Tool   = "playwright"
        Action = "browser_navigate"
        Url    = $Url
    }
}

function Invoke-PlaywrightSnapshot {
    <#
    .SYNOPSIS
        Take browser snapshot via Playwright MCP
    #>
    param(
        [string]$OutputPath = (Join-Path $env:TEMP "playwright_snapshot_$(Get-Date -Format 'yyyyMMdd_HHmmss').png")
    )

    Write-Host "[Playwright] Taking snapshot: $OutputPath" -ForegroundColor Green

    return @{
        Tool       = "playwright"
        Action     = "browser_snapshot"
        OutputPath = $OutputPath
    }
}

# ============================================================================
# MCP ROUTER
# ============================================================================

function Invoke-MCPTool {
    <#
    .SYNOPSIS
        Route to appropriate MCP tool based on action
    #>
    param(
        [Parameter(Mandatory)]
        [ValidateSet("serena", "desktop-commander", "playwright")]
        [string]$Server,
        [Parameter(Mandatory)]
        [string]$Action,
        [hashtable]$Parameters = @{}
    )

    switch ($Server) {
        "serena" {
            switch ($Action) {
                "find_symbol"  { Invoke-SerenaFindSymbol @Parameters }
                "read_file"    { Invoke-SerenaReadFile @Parameters }
                "write_memory" { Invoke-SerenaWriteMemory @Parameters }
                default        { throw "Unknown Serena action: $Action" }
            }
        }
        "desktop-commander" {
            switch ($Action) {
                "start_process"   { Invoke-DesktopCommanderProcess @Parameters }
                "read_file"       { Invoke-DesktopCommanderReadFile @Parameters }
                "write_file"      { Invoke-DesktopCommanderWriteFile @Parameters }
                "list_directory"  { Invoke-DesktopCommanderListDirectory @Parameters }
                default           { throw "Unknown Desktop Commander action: $Action" }
            }
        }
        "playwright" {
            switch ($Action) {
                "browser_navigate" { Invoke-PlaywrightNavigate @Parameters }
                "browser_snapshot" { Invoke-PlaywrightSnapshot @Parameters }
                default            { throw "Unknown Playwright action: $Action" }
            }
        }
    }
}

# Export functions
Export-ModuleMember -Function @(
    'Invoke-SerenaFindSymbol'
    'Invoke-SerenaReadFile'
    'Invoke-SerenaWriteMemory'
    'Invoke-DesktopCommanderProcess'
    'Invoke-DesktopCommanderReadFile'
    'Invoke-DesktopCommanderWriteFile'
    'Invoke-DesktopCommanderListDirectory'
    'Invoke-PlaywrightNavigate'
    'Invoke-PlaywrightSnapshot'
    'Invoke-MCPTool'
)
