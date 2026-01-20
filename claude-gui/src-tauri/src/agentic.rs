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

/// System information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    pub os: String,
    pub arch: String,
    pub hostname: String,
    pub username: String,
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

/// Open an application
#[command]
pub async fn open_application(app_name: String) -> Result<(), String> {
    let safe_apps = [
        "calc", "calculator",
        "notepad",
        "mspaint", "paint",
        "explorer",
        "msedge", "chrome", "firefox",
        "code", "vscode",
        "cmd",
    ];

    let app_lower = app_name.to_lowercase();

    if !safe_apps.iter().any(|a| app_lower.contains(a)) {
        return Err(format!("Application not in whitelist: {}", app_name));
    }

    tracing::info!("Opening application: {}", app_name);

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &app_name])
            .spawn()
            .map_err(|e| format!("Failed to open application: {}", e))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new("open")
            .arg(&app_name)
            .spawn()
            .map_err(|e| format!("Failed to open application: {}", e))?;
    }

    Ok(())
}

/// Get system information
#[command]
pub async fn get_system_info() -> Result<SystemInfo, String> {
    let os = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();

    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string());

    let username = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "unknown".to_string());

    Ok(SystemInfo {
        os,
        arch,
        hostname,
        username,
    })
}

/// Get disk space information
#[command]
pub async fn get_disk_space() -> Result<Vec<DiskInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("wmic")
            .args(["logicaldisk", "get", "size,freespace,caption"])
            .output()
            .map_err(|e| format!("Failed to get disk info: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut disks = Vec::new();

        for line in stdout.lines().skip(1) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 {
                let caption = parts[0].to_string();
                let free: u64 = parts[1].parse().unwrap_or(0);
                let size: u64 = parts[2].parse().unwrap_or(0);

                if size > 0 {
                    disks.push(DiskInfo {
                        name: caption,
                        total: size,
                        free,
                        used: size - free,
                    });
                }
            }
        }

        Ok(disks)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Not implemented for this OS".to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskInfo {
    pub name: String,
    pub total: u64,
    pub free: u64,
    pub used: u64,
}

/// Get running processes
#[command]
pub async fn get_processes() -> Result<Vec<ProcessInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("tasklist")
            .args(["/FO", "CSV", "/NH"])
            .output()
            .map_err(|e| format!("Failed to get processes: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut processes = Vec::new();

        for line in stdout.lines().take(50) { // Limit to 50 processes
            let parts: Vec<&str> = line.split(',')
                .map(|s| s.trim_matches('"'))
                .collect();

            if parts.len() >= 5 {
                processes.push(ProcessInfo {
                    name: parts[0].to_string(),
                    pid: parts[1].parse().unwrap_or(0),
                    memory: parts[4].replace(" K", "").replace(",", "").parse().unwrap_or(0),
                });
            }
        }

        Ok(processes)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Not implemented for this OS".to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub name: String,
    pub pid: u32,
    pub memory: u64,
}
