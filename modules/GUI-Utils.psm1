# HYDRA GUI UTILS v3.0 - GUI components for GeminiCLI
# 12 Witcher Agents visualization + Parallel execution display

# === Agent Configuration (ASCII-safe) ===
$script:AgentVisuals = @{
    "Geralt"   = @{ Symbol = "[W]"; Color = "White";      Role = "Security" }
    "Yennefer" = @{ Symbol = "[Y]"; Color = "Magenta";    Role = "Architecture" }
    "Triss"    = @{ Symbol = "[T]"; Color = "Red";        Role = "Testing" }
    "Jaskier"  = @{ Symbol = "[J]"; Color = "Yellow";     Role = "Documentation" }
    "Vesemir"  = @{ Symbol = "[V]"; Color = "DarkYellow"; Role = "Mentoring" }
    "Ciri"     = @{ Symbol = "[C]"; Color = "Cyan";       Role = "Speed" }
    "Eskel"    = @{ Symbol = "[E]"; Color = "DarkCyan";   Role = "DevOps" }
    "Lambert"  = @{ Symbol = "[L]"; Color = "DarkRed";    Role = "Debug" }
    "Zoltan"   = @{ Symbol = "[Z]"; Color = "DarkGray";   Role = "Data" }
    "Regis"    = @{ Symbol = "[R]"; Color = "DarkMagenta"; Role = "Research" }
    "Dijkstra" = @{ Symbol = "[D]"; Color = "DarkGreen";  Role = "Strategy" }
    "Philippa" = @{ Symbol = "[P]"; Color = "Blue";       Role = "Integration" }
}

# === ASCII Art Logos ===
function Show-HydraLogo {
    param(
        [string]$Variant = 'claude',
        [switch]$Animated
    )

    $logo = @"

    ██╗  ██╗██╗   ██╗██████╗ ██████╗  █████╗
    ██║  ██║╚██╗ ██╔╝██╔══██╗██╔══██╗██╔══██╗
    ███████║ ╚████╔╝ ██║  ██║██████╔╝███████║
    ██╔══██║  ╚██╔╝  ██║  ██║██╔══██╗██╔══██║
    ██║  ██║   ██║   ██████╔╝██║  ██║██║  ██║
    ╚═╝  ╚═╝   ╚═╝   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝
           v3.0 - 12 Witcher Agents

"@

    $simpleLogo = @"

    ##  ## ##  ## ###   ###   ###
    ##  ##  ####  ## ## ## ## ## ##
    ######   ##   ## ## ###   #####
    ##  ##   ##   ## ## ## ## ##  ##
    ##  ##   ##   ###  ##  ## ##  ##
          v3.0 - Parallel Swarm

"@

    $color = if ($Variant -eq 'claude') { 'Yellow' } else { 'Cyan' }

    if ($Animated) {
        $lines = $logo -split "`n"
        foreach ($line in $lines) {
            Write-Host $line -ForegroundColor $color
            Start-Sleep -Milliseconds 50
        }
    } else {
        # Use simple logo for better compatibility
        Write-Host $simpleLogo -ForegroundColor $color
    }
}

# === Box Drawing (ASCII) ===
function Write-Box {
    param(
        [string]$Title,
        [string[]]$Content,
        [string]$Color = 'Cyan',
        [int]$Width = 60
    )
    
    $top = "+" + ("-" * ($Width - 2)) + "+"
    $bot = "+" + ("-" * ($Width - 2)) + "+"
    $mid = "+" + ("-" * ($Width - 2)) + "+"
    
    Write-Host $top -ForegroundColor $Color
    if ($Title) {
        $titlePad = " $Title".PadRight($Width - 3)
        if ($titlePad.Length -gt ($Width - 3)) { $titlePad = $titlePad.Substring(0, $Width - 3) }
        Write-Host "|" -NoNewline -ForegroundColor $Color
        Write-Host $titlePad -NoNewline -ForegroundColor White
        Write-Host "|" -ForegroundColor $Color
        Write-Host $mid -ForegroundColor $Color
    }
    foreach ($line in $Content) {
        $linePad = " $line".PadRight($Width - 3)
        if ($linePad.Length -gt ($Width - 3)) { $linePad = $linePad.Substring(0, $Width - 3) }
        Write-Host "|" -NoNewline -ForegroundColor $Color
        Write-Host $linePad -NoNewline -ForegroundColor DarkGray
        Write-Host "|" -ForegroundColor $Color
    }
    Write-Host $bot -ForegroundColor $Color
}


# === Status Line ===
function Write-StatusLine {
    param(
        [string]$Label,
        [string]$Value,
        [string]$Status = 'ok'
    )
    
    $icon = switch ($Status) {
        'ok'      { '[OK]'; $color = 'Green' }
        'error'   { '[X]'; $color = 'Red' }
        { $_ -in 'warn', 'warning' } { '[!]'; $color = 'Yellow' }
        'info'    { '[i]'; $color = 'Cyan' }
        default   { '[.]'; $color = 'DarkGray' }
    }
    
    Write-Host "  $icon " -NoNewline -ForegroundColor $color
    Write-Host "${Label}: " -NoNewline -ForegroundColor DarkGray
    Write-Host $Value -ForegroundColor White
}

# === System Info ===
function Get-SystemInfo {
    $mem = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
    $memUsed = if ($mem) { [math]::Round(($mem.TotalVisibleMemorySize - $mem.FreePhysicalMemory) / 1MB, 1) } else { 0 }
    $memTotal = if ($mem) { [math]::Round($mem.TotalVisibleMemorySize / 1MB, 1) } else { 0 }
    $nodeVer = try { (node -v 2>$null) -replace 'v','' } catch { 'N/A' }
    $psVer = $PSVersionTable.PSVersion.ToString()
    
    return @{
        Memory = "$memUsed/$memTotal GB"
        Node = $nodeVer
        PowerShell = $psVer
    }
}


# === API Key Status ===
function Get-APIKeyStatus {
    param([string]$Provider = 'anthropic')
    
    $keyName = switch ($Provider) {
        'anthropic' { 'ANTHROPIC_API_KEY' }
        'openai'    { 'OPENAI_API_KEY' }
        'google'    { 'GOOGLE_API_KEY' }
        'gemini'    { 'GEMINI_API_KEY' }
        default     { $Provider }
    }
    
    $key = [Environment]::GetEnvironmentVariable($keyName, 'User')
    if (-not $key) { $key = [Environment]::GetEnvironmentVariable($keyName, 'Process') }
    
    if ($key) {
        $len = [Math]::Min(12, $key.Length)
        $masked = $key.Substring(0, $len) + "..." 
        return @{ Present = $true; Masked = $masked; Name = $keyName }
    }
    return @{ Present = $false; Masked = 'Not set'; Name = $keyName }
}

# === MCP Server Status ===
function Test-MCPServer {
    param([string]$Name)
    
    $result = @{ Name = $Name; Online = $false; Message = 'Unknown' }
    
    switch ($Name) {
        'ollama' {
            try {
                $r = Invoke-RestMethod -Uri 'http://localhost:11434/api/tags' -TimeoutSec 2 -ErrorAction Stop
                $result.Online = $true
                $result.Message = "$($r.models.Count) models"
            } catch { $result.Message = 'Not responding' }
        }
        default {
            $result.Online = $true
            $result.Message = 'Available'
        }
    }
    return $result
}


# === Tips of the Day ===
function Get-TipOfDay {
    $tips = @(
        "Use /help to see all available commands",
        "Press Ctrl+C to cancel current operation",
        "Double-Escape interrupts the current task",
        "Use @mcp-server tool_name to call MCP tools",
        "Parallel operations are faster - batch requests!",
        "/ai:quick for fast local AI responses",
        "/hydra:status shows system health",
        "API keys are read from environment variables",
        "Use -y or --yolo for auto-approve mode",
        "Check GEMINI.md or CLAUDE.md for full docs",
        "12 Witcher agents work in parallel for speed",
        "Ciri is fastest (llama3.2:1b) - use for simple tasks",
        "Regis (phi3:mini) excels at deep research",
        "Use /hydra for full swarm orchestration"
    )
    return $tips[(Get-Date).DayOfYear % $tips.Count]
}

# === Agent Status Display ===
function Show-AgentStatus {
    param(
        [hashtable]$ActiveAgents = @{},
        [switch]$Compact
    )

    $allAgents = @("Geralt", "Yennefer", "Triss", "Jaskier", "Vesemir", "Ciri",
                   "Eskel", "Lambert", "Zoltan", "Regis", "Dijkstra", "Philippa")

    if ($Compact) {
        # Single line compact view
        Write-Host "  Agents: " -NoNewline -ForegroundColor DarkGray
        foreach ($agent in $allAgents) {
            $visual = $script:AgentVisuals[$agent]
            $status = $ActiveAgents[$agent]
            $displayColor = switch ($status) {
                'running'   { $visual.Color }
                'completed' { 'Green' }
                'error'     { 'Red' }
                'pending'   { 'DarkGray' }
                default     { 'DarkGray' }
            }
            $char = $agent.Substring(0,1)
            Write-Host "$char" -NoNewline -ForegroundColor $displayColor
        }
        Write-Host ""
    } else {
        # Grid view (4x3)
        Write-Host ""
        Write-Host "  +--- WITCHER AGENTS (School of the Wolf) ---+" -ForegroundColor Cyan

        for ($row = 0; $row -lt 3; $row++) {
            Write-Host "  |" -NoNewline -ForegroundColor Cyan
            for ($col = 0; $col -lt 4; $col++) {
                $idx = $row * 4 + $col
                if ($idx -lt $allAgents.Count) {
                    $agent = $allAgents[$idx]
                    $visual = $script:AgentVisuals[$agent]
                    $status = $ActiveAgents[$agent]

                    $icon = switch ($status) {
                        'running'   { '[>]' }
                        'completed' { '[+]' }
                        'error'     { '[X]' }
                        'pending'   { '[.]' }
                        default     { '[ ]' }
                    }
                    $displayColor = switch ($status) {
                        'running'   { $visual.Color }
                        'completed' { 'Green' }
                        'error'     { 'Red' }
                        default     { 'DarkGray' }
                    }

                    $name = $agent.PadRight(9).Substring(0,9)
                    Write-Host " $icon" -NoNewline -ForegroundColor $displayColor
                    Write-Host "$name" -NoNewline -ForegroundColor $displayColor
                }
            }
            Write-Host " |" -ForegroundColor Cyan
        }
        Write-Host "  +--------------------------------------------+" -ForegroundColor Cyan
    }
}

# === Swarm Progress Bar ===
function Show-SwarmProgress {
    param(
        [int]$Completed = 0,
        [int]$Total = 12,
        [string]$CurrentStep = "Executing",
        [int]$Width = 40
    )

    $percent = if ($Total -gt 0) { [math]::Round(($Completed / $Total) * 100) } else { 0 }
    $filled = [math]::Round(($Completed / $Total) * $Width)
    $empty = $Width - $filled

    $bar = "[" + ("=" * $filled) + (">" * [math]::Min(1, $empty)) + (" " * [math]::Max(0, $empty - 1)) + "]"

    $color = if ($percent -lt 33) { 'Red' } elseif ($percent -lt 66) { 'Yellow' } else { 'Green' }

    Write-Host "`r  $CurrentStep " -NoNewline -ForegroundColor White
    Write-Host $bar -NoNewline -ForegroundColor $color
    Write-Host " $percent% ($Completed/$Total)" -NoNewline -ForegroundColor DarkGray
}

# === 6-Step Protocol Display ===
function Show-ProtocolStep {
    param(
        [ValidateRange(1, 6)]
        [int]$Step,
        [ValidateSet('pending', 'running', 'completed', 'error')]
        [string]$Status = 'pending'
    )

    $steps = @{
        1 = @{ Name = "SPECULATE";  Icon = "?"; Desc = "Research context" }
        2 = @{ Name = "PLAN";       Icon = "#"; Desc = "Create task plan" }
        3 = @{ Name = "EXECUTE";    Icon = ">"; Desc = "Parallel agents" }
        4 = @{ Name = "SYNTHESIZE"; Icon = "+"; Desc = "Merge results" }
        5 = @{ Name = "LOG";        Icon = "~"; Desc = "Session summary" }
        6 = @{ Name = "ARCHIVE";    Icon = "*"; Desc = "Save transcript" }
    }

    $stepInfo = $steps[$Step]
    $statusIcon = switch ($Status) {
        'running'   { '[>]' }
        'completed' { '[+]' }
        'error'     { '[X]' }
        default     { '[ ]' }
    }
    $color = switch ($Status) {
        'running'   { 'Yellow' }
        'completed' { 'Green' }
        'error'     { 'Red' }
        default     { 'DarkGray' }
    }

    Write-Host "  $statusIcon " -NoNewline -ForegroundColor $color
    Write-Host "Step $Step " -NoNewline -ForegroundColor White
    Write-Host "$($stepInfo.Name)" -NoNewline -ForegroundColor $color
    Write-Host " - $($stepInfo.Desc)" -ForegroundColor DarkGray
}

# === Full Protocol Status ===
function Show-ProtocolStatus {
    param(
        [int]$CurrentStep = 1,
        [hashtable]$StepStatus = @{}
    )

    Write-Host ""
    Write-Host "  +--- 6-STEP SWARM PROTOCOL ---+" -ForegroundColor Magenta

    for ($i = 1; $i -le 6; $i++) {
        $status = if ($StepStatus[$i]) { $StepStatus[$i] }
                  elseif ($i -lt $CurrentStep) { 'completed' }
                  elseif ($i -eq $CurrentStep) { 'running' }
                  else { 'pending' }
        Show-ProtocolStep -Step $i -Status $status
    }

    Write-Host "  +------------------------------+" -ForegroundColor Magenta
}

# === Parallel Execution Monitor ===
function Show-ParallelMonitor {
    param(
        [array]$Jobs,
        [int]$MaxConcurrent = 5
    )

    $running = ($Jobs | Where-Object { $_.Status -eq 'running' }).Count
    $completed = ($Jobs | Where-Object { $_.Status -eq 'completed' }).Count
    $pending = ($Jobs | Where-Object { $_.Status -eq 'pending' }).Count
    $total = $Jobs.Count

    Write-Host ""
    Write-Host "  +--- RUNSPACE POOL STATUS ---+" -ForegroundColor Blue
    Write-Host "  | Concurrent: " -NoNewline -ForegroundColor Blue
    Write-Host "$running/$MaxConcurrent " -NoNewline -ForegroundColor $(if($running -eq $MaxConcurrent){'Yellow'}else{'Green'})

    # Visual slot display
    Write-Host "[" -NoNewline -ForegroundColor DarkGray
    for ($i = 0; $i -lt $MaxConcurrent; $i++) {
        if ($i -lt $running) {
            Write-Host "#" -NoNewline -ForegroundColor Green
        } else {
            Write-Host "." -NoNewline -ForegroundColor DarkGray
        }
    }
    Write-Host "]" -NoNewline -ForegroundColor DarkGray
    Write-Host "    |" -ForegroundColor Blue

    Write-Host "  | Completed: $completed | Pending: $pending | Total: $total |" -ForegroundColor DarkGray
    Write-Host "  +------------------------------+" -ForegroundColor Blue
}

# === Welcome Message ===
function Show-WelcomeMessage {
    param([string]$CLI = 'Claude')
    
    $date = Get-Date -Format "yyyy-MM-dd HH:mm"
    $day = (Get-Date).DayOfWeek
    $greeting = switch ((Get-Date).Hour) {
        { $_ -lt 6 }  { "Good night" }
        { $_ -lt 12 } { "Good morning" }
        { $_ -lt 18 } { "Good afternoon" }
        default       { "Good evening" }
    }
    
    Write-Host ""
    Write-Host "  $greeting! " -NoNewline -ForegroundColor White
    Write-Host "$day, $date" -ForegroundColor DarkGray
}


# === Quick Commands ===
function Show-QuickCommands {
    param([string]$CLI = 'claude')
    
    Write-Host ""
    Write-Host "  Quick Commands:" -ForegroundColor DarkGray
    if ($CLI -eq 'claude') {
        Write-Host "    /help" -NoNewline -ForegroundColor Cyan
        Write-Host " - Help  " -NoNewline -ForegroundColor DarkGray
        Write-Host "/commit" -NoNewline -ForegroundColor Cyan
        Write-Host " - Git  " -NoNewline -ForegroundColor DarkGray
        Write-Host "/review-pr" -NoNewline -ForegroundColor Cyan
        Write-Host " - PR" -ForegroundColor DarkGray
    } else {
        Write-Host "    /ai:quick" -NoNewline -ForegroundColor Cyan
        Write-Host " - Fast  " -NoNewline -ForegroundColor DarkGray
        Write-Host "/ai:code" -NoNewline -ForegroundColor Cyan
        Write-Host " - Code  " -NoNewline -ForegroundColor DarkGray
        Write-Host "/hydra:status" -NoNewline -ForegroundColor Cyan
        Write-Host " - Status" -ForegroundColor DarkGray
    }
}

# === Separator ===
function Write-Separator {
    param([string]$Color = 'DarkGray', [int]$Width = 55)
    Write-Host ("-" * $Width) -ForegroundColor $Color
}

# === Session Timer ===
$script:SessionStart = Get-Date
function Get-SessionDuration {
    $duration = (Get-Date) - $script:SessionStart
    $fmt = "{0:hh\:mm\:ss}" -f $duration
    return $fmt
}

function Show-TheEndBanner {
    param([switch]$NoAnimation)

    $art = @"

  ████████╗██╗  ██╗███████╗    ███████╗███╗   ██╗██████╗
  ╚══██╔══╝██║  ██║██╔════╝    ██╔════╝████╗  ██║██╔══██╗
     ██║   ███████║█████╗      █████╗  ██╔██╗ ██║██║  ██║
     ██║   ██╔══██║██╔══╝      ██╔══╝  ██║╚██╗██║██║  ██║
     ██║   ██║  ██║███████╗    ███████╗██║ ╚████║██████╔╝
     ╚═╝   ╚═╝  ╚═╝╚══════╝    ╚══════╝╚═╝  ╚═══╝╚═════╝

"@

    $simpleArt = @"

  ######## ##  ## #######   ####### ###  ## ######
     ##    ##  ## ##        ##      #### ## ##   ##
     ##    ###### ####      ####    ## #### ##   ##
     ##    ##  ## ##        ##      ##  ### ##   ##
     ##    ##  ## #######   ####### ##   ## ######

         HYDRA v3.0 - Mission Complete

"@

    if ($NoAnimation) {
        Write-Host $simpleArt -ForegroundColor Yellow
        Write-Host '             THE END' -ForegroundColor Yellow
    } else {
        $colors = @('DarkYellow', 'Yellow', 'White', 'Yellow', 'DarkYellow')
        $blinkOn = $true
        foreach ($color in $colors) {
            Clear-Host
            Write-Host $simpleArt -ForegroundColor $color
            if ($blinkOn) {
                Write-Host '             THE END' -ForegroundColor White
            } else {
                Write-Host (' ' * 20)
            }
            Start-Sleep -Milliseconds 200
            $blinkOn = -not $blinkOn
        }
    }
}

# === THE END ASCII Art ===
function Show-TheEnd {
    param(
        [string]$Variant = 'gemini',
        [string]$SessionDuration = ''
    )

    Show-TheEndBanner

    $color = switch ($Variant) {
        'claude' { 'Yellow' }
        'gemini' { 'Cyan' }
        default  { 'White' }
    }
    $accentColor = switch ($Variant) {
        'claude' { 'DarkYellow' }
        'gemini' { 'DarkCyan' }
        default  { 'DarkGray' }
    }
    
    $date = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "  +-----------------------------------------------------+" -ForegroundColor $accentColor
    Write-Host "  |" -NoNewline -ForegroundColor $accentColor
    Write-Host "  Session completed: $date" -NoNewline -ForegroundColor White
    Write-Host "       |" -ForegroundColor $accentColor
    if ($SessionDuration) {
        Write-Host "  |" -NoNewline -ForegroundColor $accentColor
        Write-Host "  Duration: $SessionDuration" -NoNewline -ForegroundColor Green
        $padding = " " * (39 - $SessionDuration.Length)
        Write-Host "$padding|" -ForegroundColor $accentColor
    }
    Write-Host "  |" -NoNewline -ForegroundColor $accentColor
    Write-Host "  Thank you for using HYDRA!" -NoNewline -ForegroundColor $color
    Write-Host "                  |" -ForegroundColor $accentColor
    Write-Host "  +-----------------------------------------------------+" -ForegroundColor $accentColor
    Write-Host ""
}

function Show-ProgressAnimation {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [scriptblock]$ScriptBlock,

        [string]$Message = "Working"
    )


    $job = Start-Job -ScriptBlock $ScriptBlock
    $animation = @('|', '/', '-', '\')
    $i = 0

    while ($job.State -eq 'Running') {
        Write-Host "`r$Message... $($animation[$i % $animation.Length])" -NoNewline
        $i++
        Start-Sleep -Milliseconds 100
    }

    Write-Host "`r$Message... Done.      "
    Receive-Job $job | Out-Null
    Remove-Job $job
}

# === Export ===
Export-ModuleMember -Function @(
    # Core Display
    'Show-HydraLogo', 'Write-Box', 'Write-StatusLine', 'Write-Separator',
    # System Info
    'Get-SystemInfo', 'Get-APIKeyStatus', 'Test-MCPServer',
    # Welcome & Tips
    'Get-TipOfDay', 'Show-WelcomeMessage', 'Show-QuickCommands',
    # Session Management
    'Get-SessionDuration', 'Show-TheEnd', 'Show-TheEndBanner',
    # NEW v3.0: Agent Visualization
    'Show-AgentStatus', 'Show-SwarmProgress',
    # NEW v3.0: Protocol Display
    'Show-ProtocolStep', 'Show-ProtocolStatus',
    # NEW v3.0: Parallel Execution Monitor
    'Show-ParallelMonitor', 'Show-ProgressAnimation'
) -Variable @('AgentVisuals')
