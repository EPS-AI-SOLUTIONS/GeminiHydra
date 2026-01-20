use serde::{Deserialize, Serialize};
use std::process::Command;
use tauri::command;

/// Command execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

/// Available safe commands (whitelist)
const SAFE_COMMANDS: &[&str] = &[
    // System info
    "systeminfo",
    "hostname",
    "whoami",
    "ver",
    // Disk
    "wmic logicaldisk",
    "dir",
    "tree",
    "diskpart /l",
    // Process
    "tasklist",
    "wmic process",
    // Network
    "ipconfig",
    "netstat",
    "ping",
    "nslookup",
    // Calculator & apps
    "calc",
    "notepad",
    "mspaint",
    "explorer",
    // Date/Time
    "date /t",
    "time /t",
    // Environment
    "set",
    "echo",
    "path",
    // File operations (read-only)
    "type",
    "findstr",
    "find",
    "more",
];

/// Check if command is safe
fn is_safe_command(cmd: &str) -> bool {
    let cmd_lower = cmd.to_lowercase();

    // Deny list - dangerous operations
    let deny_patterns = [
        "del ", "rm ", "rmdir", "remove-item",
        "format", "fdisk",
        "shutdown", "restart",
        "> ", ">> ", "| ", // Redirections and pipes can be dangerous
        "reg ", "regedit",
        "net user", "net localgroup",
        "powershell -enc", // Encoded commands
        "cmd /c", // Nested commands
        "start /b", // Background processes
    ];

    for pattern in deny_patterns.iter() {
        if cmd_lower.contains(pattern) {
            return false;
        }
    }

    // Check if starts with a safe command
    for safe in SAFE_COMMANDS.iter() {
        if cmd_lower.starts_with(&safe.to_lowercase()) {
            return true;
        }
    }

    false
}

/// Execute a system command (safe mode)
#[command]
pub async fn execute_command(command: String, safe_mode: bool) -> Result<CommandResult, String> {
    // In safe mode, validate command
    if safe_mode && !is_safe_command(&command) {
        return Err(format!(
            "Command not allowed in safe mode: {}. Only read-only and system info commands are permitted.",
            command
        ));
    }

    tracing::info!("Executing command: {}", command);

    #[cfg(target_os = "windows")]
    let output = Command::new("cmd")
        .args(["/C", &command])
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    #[cfg(not(target_os = "windows"))]
    let output = Command::new("sh")
        .args(["-c", &command])
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    Ok(CommandResult {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code(),
    })
}

