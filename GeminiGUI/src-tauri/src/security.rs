// ============================================================================
// SECURITY: Configuration and validation
// ============================================================================

/// SECURITY: Allowlist of safe commands
pub const ALLOWED_COMMANDS: &[&str] = &[
    "dir",
    "ls",
    "pwd",
    "cd",
    "echo",
    "type",
    "cat",
    "head",
    "tail",
    "tree",
    "find",
    "where",
    "ver",  // Windows version
    "uname",  // Unix version/system info
    "Get-Date",
    "Get-Location",
    "Get-ChildItem",
    "Get-Content",
    "Test-Path",
    "Resolve-Path",
    "Select-String",  // PowerShell grep equivalent
    "Measure-Object",  // PowerShell wc equivalent
    "whoami",
    "hostname",
    "systeminfo",
    "ipconfig",
    "netstat",
    "tasklist",
    "git status",
    "git log",
    "git branch",
    "git diff",
    "git remote -v",
    "git show",
    "node --version",
    "npm --version",
    "npm list",
    "npm run build",
    "npx tsc",
    "python --version",
    "pip list",
];

/// Check if a command is in the allowlist
pub fn is_command_allowed(command: &str) -> bool {
    let cmd_lower = command.to_lowercase();
    ALLOWED_COMMANDS.iter().any(|allowed| {
        let allowed_lower = allowed.to_lowercase();
        cmd_lower.starts_with(&allowed_lower) || cmd_lower == allowed_lower
    })
}

/// SECURITY: Check for shell metacharacters that enable command chaining/injection.
/// Must be called BEFORE the allowlist check to prevent payloads like
/// `echo safe && rm -rf /` from passing the prefix-based allowlist.
pub fn contains_shell_metacharacters(cmd: &str) -> bool {
    let dangerous_sequences = [
        "&&", "||", ";", "|", "`", "$(", "${",
        "\n", "\r", "\0",
    ];
    for seq in dangerous_sequences {
        if cmd.contains(seq) {
            return true;
        }
    }
    // Check for output redirection operators (>, >>).
    // These are single-char so we match them separately to avoid
    // false positives from multi-char sequences like "->".
    if cmd.contains('>') || cmd.contains('<') {
        return true;
    }
    false
}
