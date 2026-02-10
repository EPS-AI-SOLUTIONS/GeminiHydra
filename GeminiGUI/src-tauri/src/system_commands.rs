// ============================================================================
// SYSTEM COMMANDS: Shell execution, swarm spawn, file operations
// ============================================================================

use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};
use std::fs;
use tauri::{AppHandle, Emitter, Manager, Window};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use crate::security::{contains_shell_metacharacters, is_command_allowed};
use crate::gemini_api::StreamPayload;
use crate::get_project_root;

#[tauri::command]
pub async fn run_system_command(command: String) -> Result<String, String> {
    // SECURITY: Step 1 - Block shell metacharacters FIRST to prevent injection
    if contains_shell_metacharacters(&command) {
        return Err(format!(
            "SECURITY: Command contains shell metacharacters (chaining/injection blocked): '{}'",
            command.chars().take(50).collect::<String>()
        ));
    }

    // SECURITY: Step 2 - Check the allowlist
    if !is_command_allowed(&command) {
        return Err(format!(
            "SECURITY: Command '{}' is not in the allowlist",
            command.chars().take(50).collect::<String>()
        ));
    }

    // SECURITY: Step 3 - Additional dangerous pattern check on the full command
    let dangerous_patterns = [
        "rm ", "del ", "rmdir", "format", "mkfs", ">", ">>",
        "Remove-Item", "Clear-Content", "Set-Content", "Invoke-Expression", "iex",
        "Start-Process", "curl", "wget", "Invoke-WebRequest",
    ];

    for pattern in dangerous_patterns {
        if command.to_lowercase().contains(&pattern.to_lowercase()) {
            return Err(format!(
                "SECURITY: Command contains dangerous pattern '{}'",
                pattern
            ));
        }
    }

    let project_root = get_project_root();

    #[cfg(target_os = "windows")]
    let utf8_command = format!(
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; {}",
        command
    );
    #[cfg(target_os = "windows")]
    let output = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &utf8_command,
        ])
        .current_dir(&project_root)
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    #[cfg(not(target_os = "windows"))]
    let output = std::process::Command::new("sh")
        .arg("-c")
        .arg(&command)
        .current_dir(&project_root)
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !stderr.is_empty() && !stdout.is_empty() {
        Ok(format!("{}\n[STDERR]: {}", stdout, stderr))
    } else if !stderr.is_empty() {
        Ok(format!("[STDERR]: {}", stderr))
    } else {
        Ok(stdout)
    }
}

#[tauri::command]
pub async fn spawn_swarm_agent_v2(
    app: AppHandle,
    window: Window,
    objective: String,
) -> Result<(), String> {
    let dangerous_chars = ['`', '$', '|', '&', ';', '>', '<', '\n', '\r'];
    for c in dangerous_chars {
        if objective.contains(c) {
            return Err(format!(
                "SECURITY: Objective contains dangerous character '{}'",
                c
            ));
        }
    }

    if objective.len() > 1000 {
        return Err("SECURITY: Objective too long (max 1000 characters)".to_string());
    }

    let base_dir = app.path().executable_dir().map_err(|e| e.to_string())?;

    let possible_paths = vec![
        base_dir.join("bin").join("run-swarm.ps1"),
        base_dir.join("release").join("bin").join("run-swarm.ps1"),
        base_dir
            .join("target")
            .join("release")
            .join("bin")
            .join("run-swarm.ps1"),
        base_dir.join("../../bin/run-swarm.ps1"),
        base_dir.join("../bin/run-swarm.ps1"),
    ];

    let mut script_path = None;
    for path in &possible_paths {
        if path.exists() {
            script_path = Some(path.clone());
            break;
        }
    }

    let script_path = script_path.ok_or_else(|| {
        format!(
            "CRITICAL: run-swarm.ps1 NOT FOUND. Checked: {:?}",
            possible_paths
        )
    })?;

    let script_path = std::fs::canonicalize(&script_path).unwrap_or(script_path);
    let mut script_path_str = script_path.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    if script_path_str.starts_with(r"\\?\") {
        script_path_str = script_path_str[4..].to_string();
    }

    #[cfg(target_os = "windows")]
    let mut child = Command::new("powershell")
        .args([
            "-NoProfile",
            "-WindowStyle",
            "Hidden",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &format!(
                "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; & '{}' '{}'",
                script_path_str, objective
            ),
        ])
        .current_dir(&base_dir)
        .creation_flags(0x08000000)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn swarm: {}", e))?;

    #[cfg(not(target_os = "windows"))]
    let mut child = Command::new("pwsh")
        .args(["-NoProfile", "-File", &script_path_str, &objective])
        .current_dir(&base_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn swarm: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

    let window_clone = window.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().flatten() {
            let _ = window_clone.emit(
                "swarm-data",
                StreamPayload {
                    chunk: line + "\n",
                    done: false,
                },
            );
        }
    });

    let window_clone2 = window.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().flatten() {
            let _ = window_clone2.emit(
                "swarm-data",
                StreamPayload {
                    chunk: format!("[ERR] {}\n", line),
                    done: false,
                },
            );
        }
    });

    std::thread::spawn(move || {
        let status = child.wait();
        let msg = match status {
            Ok(s) if s.success() => "\n[SWARM COMPLETED SUCCESSFULLY]\n".to_string(),
            Ok(s) => format!("\n[SWARM EXITED WITH CODE: {:?}]\n", s.code()),
            Err(e) => format!("\n[SWARM ERROR: {}]\n", e),
        };
        let _ = window.emit(
            "swarm-data",
            StreamPayload {
                chunk: msg,
                done: true,
            },
        );
    });

    Ok(())
}

#[tauri::command]
pub fn save_file_content(path: String, content: String) -> Result<(), String> {
    let file_path = Path::new(&path);

    let dangerous_extensions = [".exe", ".dll", ".bat", ".cmd", ".ps1", ".sh", ".msi"];
    if let Some(ext) = file_path.extension() {
        let ext_str = format!(".{}", ext.to_string_lossy().to_lowercase());
        if dangerous_extensions.contains(&ext_str.as_str()) {
            return Err(format!(
                "SECURITY: Cannot write executable files ({})",
                ext_str
            ));
        }
    }

    fs::write(&path, content).map_err(|e| format!("Failed to save file: {}", e))
}
