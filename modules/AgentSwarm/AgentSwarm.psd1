@{
    # Script module or binary module file associated with this manifest.
    RootModule = 'AgentSwarm.psm1'

    # Version number of this module.
    ModuleVersion = '3.0.0'

    # ID used to uniquely identify this module
    GUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

    # Author of this module
    Author = 'ClaudeCli Local - Jaskier Edition'

    # Company or vendor of this module
    CompanyName = 'School of the Wolf'

    # Description of the functionality provided by this module
    Description = '12 Witcher Agents Protocol with 6-Step Swarm and Parallel Execution via RunspacePool'

    # Minimum version of the PowerShell engine required by this module
    PowerShellVersion = '5.1'

    # Functions to export from this module
    FunctionsToExport = @(
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

    # Variables to export from this module
    VariablesToExport = @()

    # Aliases to export from this module
    AliasesToExport = @()

    # Private data to pass to the module specified in RootModule/ModuleToProcess
    PrivateData = @{
        PSData = @{
            # Tags applied to this module
            Tags = @('AI', 'Ollama', 'Witcher', 'Agents', 'Swarm', 'Parallel')

            # License URI
            LicenseUri = ''

            # Project URI
            ProjectUri = ''

            # Release notes
            ReleaseNotes = @'
## v3.0.0 - School of the Wolf Edition
- 12 Witcher Agents (expanded from 4)
- Parallel execution via RunspacePool
- Smart Queue with batch processing
- YOLO Mode (fast & dangerous)
- 6-Step Protocol: Speculate, Plan, Execute, Synthesize, Log, Archive
- Memory system for agents
- Auto-detect Ollama
'@
        }
    }
}
