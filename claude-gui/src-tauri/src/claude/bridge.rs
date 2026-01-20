use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;

use super::types::{ApprovalType, ClaudeEvent, ClaudeStreamEvent};

/// Claude CLI Bridge - manages communication with Claude Code CLI
pub struct ClaudeBridge {
    child: Option<Child>,
    stdin_tx: Option<mpsc::Sender<String>>,
    session_id: Option<String>,
    working_dir: String,
}

impl ClaudeBridge {
    pub fn new() -> Self {
        Self {
            child: None,
            stdin_tx: None,
            session_id: None,
            working_dir: String::new(),
        }
    }

    /// Spawn Claude CLI process
    pub async fn spawn(
        &mut self,
        working_dir: &str,
        cli_path: &str,
        initial_prompt: Option<String>,
        event_tx: mpsc::Sender<ClaudeEvent>,
    ) -> Result<(), String> {
        if self.child.is_some() {
            return Err("Session already active".to_string());
        }

        self.working_dir = working_dir.to_string();

        // Build command
        let mut cmd = Command::new("node");
        cmd.arg(cli_path)
            .arg("--output-format=stream-json")
            .current_dir(working_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        // Add initial prompt if provided
        if let Some(prompt) = initial_prompt {
            cmd.arg("-p").arg(prompt);
        }

        // Windows-specific: prevent console window
        #[cfg(windows)]
        {
            #[allow(unused_imports)]
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn Claude CLI: {}", e))?;

        // Take stdin
        let stdin = child.stdin.take().ok_or("Failed to capture stdin")?;
        let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

        // Create stdin channel
        let (stdin_tx, mut stdin_rx) = mpsc::channel::<String>(100);
        self.stdin_tx = Some(stdin_tx);

        // Spawn stdin writer task
        tokio::spawn(async move {
            let mut stdin = stdin;
            while let Some(input) = stdin_rx.recv().await {
                if let Err(e) = stdin.write_all(input.as_bytes()).await {
                    tracing::error!("Failed to write to stdin: {}", e);
                    break;
                }
                if let Err(e) = stdin.flush().await {
                    tracing::error!("Failed to flush stdin: {}", e);
                    break;
                }
            }
        });

        // Spawn stdout reader task
        let event_tx_clone = event_tx.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                if line.is_empty() {
                    continue;
                }

                // Parse NDJSON line
                match serde_json::from_str::<ClaudeStreamEvent>(&line) {
                    Ok(stream_event) => {
                        let event = Self::convert_stream_event(stream_event);
                        if event_tx_clone.send(event).await.is_err() {
                            break;
                        }
                    }
                    Err(_) => {
                        // Non-JSON output, treat as raw text
                        let event = ClaudeEvent::new("output", serde_json::json!({
                            "text": line,
                            "raw": true,
                        }));
                        if event_tx_clone.send(event).await.is_err() {
                            break;
                        }
                    }
                }
            }
        });

        // Spawn stderr reader task
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                if line.is_empty() {
                    continue;
                }

                let event = ClaudeEvent::new("stderr", serde_json::json!({
                    "text": line,
                }));
                if event_tx.send(event).await.is_err() {
                    break;
                }
            }
        });

        self.child = Some(child);
        self.session_id = Some(uuid::Uuid::new_v4().to_string());

        tracing::info!("Claude CLI spawned in {}", working_dir);
        Ok(())
    }

    /// Convert stream event to ClaudeEvent
    fn convert_stream_event(event: ClaudeStreamEvent) -> ClaudeEvent {
        match event {
            ClaudeStreamEvent::System { message } => {
                ClaudeEvent::new("system", serde_json::json!({ "message": message }))
            }
            ClaudeStreamEvent::Assistant { message, session_id } => {
                ClaudeEvent::new("assistant", serde_json::json!({
                    "message": message,
                    "session_id": session_id,
                }))
            }
            ClaudeStreamEvent::ToolUse { id, name, input } => {
                let mut event = ClaudeEvent::new("tool_use", serde_json::json!({
                    "id": id,
                    "name": name,
                    "input": input,
                }));

                // Check if this requires approval
                if let Some(approval_type) = Self::detect_approval_type(&name, &input) {
                    event = event.with_approval(approval_type);
                }

                event
            }
            ClaudeStreamEvent::ToolResult { id, output, is_error } => {
                ClaudeEvent::new("tool_result", serde_json::json!({
                    "id": id,
                    "output": output,
                    "is_error": is_error,
                }))
            }
            ClaudeStreamEvent::PermissionRequest { tool, action, details } => {
                let approval_type = Self::parse_permission_request(&tool, &action, &details);
                ClaudeEvent::new("permission_request", serde_json::json!({
                    "tool": tool,
                    "action": action,
                    "details": details,
                })).with_approval(approval_type)
            }
            ClaudeStreamEvent::Result { session_id, cost_usd, duration_ms } => {
                ClaudeEvent::new("result", serde_json::json!({
                    "session_id": session_id,
                    "cost_usd": cost_usd,
                    "duration_ms": duration_ms,
                }))
            }
            ClaudeStreamEvent::Error { message } => {
                ClaudeEvent::new("error", serde_json::json!({ "message": message }))
            }
        }
    }

    /// Detect approval type from tool use
    fn detect_approval_type(name: &str, input: &serde_json::Value) -> Option<ApprovalType> {
        match name {
            "Bash" => {
                let command = input.get("command").and_then(|v| v.as_str())?;
                let description = input.get("description").and_then(|v| v.as_str()).map(String::from);
                Some(ApprovalType::BashCommand {
                    command: command.to_string(),
                    description,
                })
            }
            "Write" => {
                let path = input.get("file_path").and_then(|v| v.as_str())?;
                Some(ApprovalType::FileWrite {
                    path: path.to_string(),
                })
            }
            "Edit" => {
                let path = input.get("file_path").and_then(|v| v.as_str())?;
                let changes = input.get("old_string").and_then(|v| v.as_str()).map(String::from);
                Some(ApprovalType::FileEdit {
                    path: path.to_string(),
                    changes,
                })
            }
            "Read" => {
                let path = input.get("file_path").and_then(|v| v.as_str())?;
                Some(ApprovalType::FileRead {
                    path: path.to_string(),
                })
            }
            "WebFetch" => {
                let url = input.get("url").and_then(|v| v.as_str())?;
                Some(ApprovalType::WebFetch {
                    url: url.to_string(),
                })
            }
            name if name.starts_with("mcp__") => {
                let parts: Vec<&str> = name.split("__").collect();
                if parts.len() >= 3 {
                    Some(ApprovalType::McpTool {
                        server: parts[1].to_string(),
                        tool: parts[2..].join("__"),
                        input: Some(input.clone()),
                    })
                } else {
                    None
                }
            }
            _ => None,
        }
    }

    /// Parse permission request
    fn parse_permission_request(
        tool: &str,
        action: &str,
        details: &serde_json::Value,
    ) -> ApprovalType {
        match tool {
            "Bash" => ApprovalType::BashCommand {
                command: action.to_string(),
                description: details.get("description").and_then(|v| v.as_str()).map(String::from),
            },
            "Write" => ApprovalType::FileWrite {
                path: action.to_string(),
            },
            "Edit" => ApprovalType::FileEdit {
                path: action.to_string(),
                changes: None,
            },
            "Read" => ApprovalType::FileRead {
                path: action.to_string(),
            },
            "WebFetch" => ApprovalType::WebFetch {
                url: action.to_string(),
            },
            _ => ApprovalType::McpTool {
                server: tool.to_string(),
                tool: action.to_string(),
                input: Some(details.clone()),
            },
        }
    }

    /// Write to Claude CLI stdin
    pub async fn write(&self, input: &str) -> Result<(), String> {
        if let Some(tx) = &self.stdin_tx {
            tx.send(input.to_string())
                .await
                .map_err(|e| format!("Failed to send to stdin: {}", e))
        } else {
            Err("No active session".to_string())
        }
    }

    /// Send approval (y + Enter)
    pub async fn approve(&self) -> Result<(), String> {
        self.write("y\n").await
    }

    /// Send denial (n + Enter)
    pub async fn deny(&self) -> Result<(), String> {
        self.write("n\n").await
    }

    /// Stop the session
    pub async fn stop(&mut self) -> Result<(), String> {
        if let Some(mut child) = self.child.take() {
            child.kill().await.map_err(|e| format!("Failed to kill process: {}", e))?;
        }
        self.stdin_tx = None;
        self.session_id = None;
        Ok(())
    }

    /// Check if session is active
    pub fn is_active(&self) -> bool {
        self.child.is_some()
    }

    /// Get session ID
    pub fn session_id(&self) -> Option<&str> {
        self.session_id.as_deref()
    }

    /// Get working directory
    pub fn working_dir(&self) -> &str {
        &self.working_dir
    }
}

impl Default for ClaudeBridge {
    fn default() -> Self {
        Self::new()
    }
}
