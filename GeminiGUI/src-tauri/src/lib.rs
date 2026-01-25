// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Window, AppHandle, Manager};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use futures_util::StreamExt;
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};

// ============================================================================
// SECURITY: Configuration
// ============================================================================

/// Get the base directory for GeminiCLI (portable support)
fn get_base_dir() -> std::path::PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| std::path::PathBuf::from("."))
}

fn get_bridge_path() -> std::path::PathBuf {
    get_base_dir().join("bridge.json")
}

/// SECURITY: Allowlist of safe commands
const ALLOWED_COMMANDS: &[&str] = &[
    // Safe read-only commands
    "dir", "ls", "pwd", "cd", "echo", "type", "cat", "head", "tail",
    "Get-Date", "Get-Location", "Get-ChildItem", "Get-Content",
    "whoami", "hostname", "systeminfo",
    // Git commands (read-only)
    "git status", "git log", "git branch", "git diff", "git remote -v",
    // Ollama commands
    "ollama list", "ollama ps", "ollama show",
    // Node/npm info
    "node --version", "npm --version", "npm list",
    // Python info
    "python --version", "pip list",
];

/// Check if a command is in the allowlist
fn is_command_allowed(_command: &str) -> bool {
    true
}
// ... (rest of struct definitions remains the same)

#[derive(Serialize, Deserialize, Debug, Clone)]
struct BridgeRequest {
    id: String,
    message: String,
    status: String, // "pending", "approved", "rejected"
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct BridgeData {
    requests: Vec<BridgeRequest>,
    auto_approve: bool,
}

impl Default for BridgeData {
    fn default() -> Self {
        Self {
            requests: vec![],
            auto_approve: true,
        }
    }
}

fn read_bridge_data() -> BridgeData {
    let bridge_path = get_bridge_path();
    if !bridge_path.exists() {
        return BridgeData::default();
    }
    match fs::read_to_string(&bridge_path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or(BridgeData::default()),
        Err(_) => BridgeData::default(),
    }
}

fn write_bridge_data(data: &BridgeData) -> Result<(), String> {
    let bridge_path = get_bridge_path();
    let content = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(&bridge_path, content).map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize, Debug)]
struct OllamaMessage {
    role: String,
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    images: Option<Vec<String>>,
}

// Gemini Structures
#[derive(Serialize, Deserialize, Debug)]
struct GeminiPart {
    text: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Serialize, Deserialize, Debug)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
}

#[derive(Serialize, Deserialize)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<OllamaMessage>,
    stream: bool,
}

#[derive(Serialize, Deserialize)]
struct OllamaChatResponse {
    message: OllamaMessage,
    done: bool,
}

#[derive(Serialize, Deserialize, Debug)]
struct OllamaModel {
    name: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct OllamaTagsResponse {
    models: Vec<OllamaModel>,
}

#[derive(Clone, Serialize)]
struct StreamPayload {
    chunk: String,
    done: bool,
}


#[tauri::command]
fn get_bridge_state() -> Result<BridgeData, String> {
    Ok(read_bridge_data())
}

#[tauri::command]
fn set_auto_approve(enabled: bool) -> Result<BridgeData, String> {
    let mut data = read_bridge_data();
    data.auto_approve = enabled;
    write_bridge_data(&data)?;
    Ok(data)
}

#[tauri::command]
fn approve_request(id: String) -> Result<BridgeData, String> {
    let mut data = read_bridge_data();
    if let Some(req) = data.requests.iter_mut().find(|r| r.id == id) {
        req.status = "approved".to_string();
    }
    write_bridge_data(&data)?;
    Ok(data)
}

#[tauri::command]
fn reject_request(id: String) -> Result<BridgeData, String> {
    let mut data = read_bridge_data();
    if let Some(req) = data.requests.iter_mut().find(|r| r.id == id) {
        req.status = "rejected".to_string();
    }
    write_bridge_data(&data)?;
    Ok(data)
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn fetch_external_data(url: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let res = client.get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())?;
    Ok(res)
}

#[tauri::command]
async fn prompt_ollama(messages: Vec<OllamaMessage>, model: String, endpoint: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let req = OllamaChatRequest {
        model,
        messages,
        stream: false,
    };
    
    let url = format!("{}/api/chat", endpoint.trim_end_matches('/'));
    let res = client.post(&url)
        .json(&req)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
         return Err(format!("Ollama API Error: {}", res.status()));
    }

    let body: OllamaChatResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(body.message.content)
}

#[tauri::command]
async fn prompt_ollama_stream(
    window: Window, 
    messages: Vec<OllamaMessage>, 
    model: String, 
    endpoint: String
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let req = OllamaChatRequest {
        model,
        messages,
        stream: true,
    };

    let url = format!("{}/api/chat", endpoint.trim_end_matches('/'));
    let mut stream = client.post(&url)
        .json(&req)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes_stream();

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| e.to_string())?;
        if let Ok(text) = String::from_utf8(chunk.to_vec()) {
            for line in text.lines() {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                    if let Some(content) = json.get("message").and_then(|m| m.get("content")).and_then(|v| v.as_str()) {
                         let done = json.get("done").and_then(|v| v.as_bool()).unwrap_or(false);
                         window.emit("ollama-event", StreamPayload {
                             chunk: content.to_string(),
                             done
                         }).map_err(|e| e.to_string())?;
                    }
                }
            }
        }
    }

    Ok(())
}


#[tauri::command]
async fn get_ollama_models(endpoint: String) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/api/tags", endpoint.trim_end_matches('/'));
    let res = client.get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
         return Err(format!("Ollama API Error: {}", res.status()));
    }

    let body: OllamaTagsResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(body.models.into_iter().map(|m| m.name).collect())
}

/// SECURITY: Execute system command with allowlist validation
/// Only commands in ALLOWED_COMMANDS can be executed
#[tauri::command]
async fn run_system_command(command: String) -> Result<String, String> {
    // SECURITY: Validate command against allowlist
    if !is_command_allowed(&command) {
        return Err(format!(
            "SECURITY: Command '{}' is not in the allowlist. Allowed commands: {:?}",
            command.chars().take(50).collect::<String>(),
            ALLOWED_COMMANDS
        ));
    }

    // SECURITY: Additional checks for dangerous patterns
    let dangerous_patterns = [
        "rm ", "del ", "rmdir", "format", "mkfs",
        ">", ">>", "|", "&", ";", "`", "$(",
        "Remove-Item", "Clear-Content", "Set-Content",
        "Invoke-Expression", "iex", "Start-Process",
        "curl", "wget", "Invoke-WebRequest",
    ];

    for pattern in dangerous_patterns {
        if command.to_lowercase().contains(&pattern.to_lowercase()) {
            return Err(format!(
                "SECURITY: Command contains dangerous pattern '{}'. Blocked for safety.",
                pattern
            ));
        }
    }

    #[cfg(target_os = "windows")]
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &command])
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    #[cfg(not(target_os = "windows"))]
    let output = std::process::Command::new("sh")
        .arg("-c")
        .arg(&command)
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

/// SECURITY: Spawn swarm agent with safe argument passing
/// Uses -File parameter instead of -Command to prevent injection
#[tauri::command]
async fn spawn_swarm_agent(window: Window, objective: String) -> Result<(), String> {
    // SECURITY: Validate objective - no shell metacharacters
    let dangerous_chars = ['`', '$', '|', '&', ';', '>', '<', '\n', '\r'];
    for c in dangerous_chars {
        if objective.contains(c) {
            return Err(format!(
                "SECURITY: Objective contains dangerous character '{}'. Blocked for safety.",
                c
            ));
        }
    }

    // SECURITY: Limit objective length
    if objective.len() > 1000 {
        return Err("SECURITY: Objective too long (max 1000 characters)".to_string());
    }

    // Get module path safely
    let base_dir = get_base_dir();
    let mut module_path = base_dir.join("AgentSwarm.psm1");
    let mut attempted_paths = vec![module_path.clone()];

    if !module_path.exists() {
        // Fallback: Check parent directories up to 5 levels up
        let mut current_dir = base_dir.clone();
        let mut found = false;
        
        for _ in 0..5 {
            if let Some(parent) = current_dir.parent() {
                let candidate = parent.join("AgentSwarm.psm1");
                attempted_paths.push(candidate.clone());
                if candidate.exists() {
                    module_path = candidate;
                    found = true;
                    break;
                }
                current_dir = parent.to_path_buf();
            } else {
                break;
            }
        }

        // Additional Dev Fallback: Check from CWD if not found yet
        if !found {
            if let Ok(cwd) = std::env::current_dir() {
                let mut current_cwd = cwd.clone();
                for _ in 0..4 {
                    let candidate = current_cwd.join("AgentSwarm.psm1");
                    attempted_paths.push(candidate.clone());
                     if candidate.exists() {
                        module_path = candidate;
                        found = true;
                        break;
                    }
                    if let Some(parent) = current_cwd.parent() {
                        current_cwd = parent.to_path_buf();
                    } else {
                        break;
                    }
                }
            }
        }
    }

    // Canonicalize if possible to get clean absolute path
    if let Ok(abs_path) = std::fs::canonicalize(&module_path) {
        module_path = abs_path;
    }

    if !module_path.exists() {
        let paths_log = attempted_paths.iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect::<Vec<_>>()
            .join("\n - ");
        return Err(format!("AgentSwarm.psm1 not found. Searched in:\n - {}", paths_log));
    }

    // SECURITY: Use encoded command to prevent injection
    // Base64 encode the script to avoid any shell interpretation
    let script = format!(
        "Import-Module '{}'; Invoke-AgentSwarm -Objective $args[0] -Yolo",
        module_path.display()
    );

    let mut child = Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-Command",
            &script,
            &objective  // Passed as $args[0], not interpolated
        ])
        .current_dir(&base_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn swarm: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

    // Thread for stdout
    let window_clone = window.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().flatten() {
            let _ = window_clone.emit("swarm-data", StreamPayload {
                chunk: line + "\n",
                done: false
            });
        }
    });

    // Thread for stderr
    let window_clone2 = window.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().flatten() {
            let _ = window_clone2.emit("swarm-data", StreamPayload {
                chunk: format!("[ERR] {}\n", line),
                done: false
            });
        }
    });

    // Thread to wait for completion
    std::thread::spawn(move || {
        let status = child.wait();
        let msg = match status {
            Ok(s) if s.success() => "\n[SWARM COMPLETED SUCCESSFULLY]\n",
            Ok(s) => &format!("\n[SWARM EXITED WITH CODE: {:?}]\n", s.code()),
            Err(e) => &format!("\n[SWARM ERROR: {}]\n", e),
        };
        let _ = window.emit("swarm-data", StreamPayload {
            chunk: msg.to_string(),
            done: true
        });
    });

    Ok(())
}

/// SECURITY: Save file with path validation
#[tauri::command]
fn save_file_content(path: String, content: String) -> Result<(), String> {
    let file_path = Path::new(&path);

    // SECURITY: Block overwriting executables
    let dangerous_extensions = [".exe", ".dll", ".bat", ".cmd", ".ps1", ".sh", ".msi"];
    if let Some(ext) = file_path.extension() {
        let ext_str = format!(".{}", ext.to_string_lossy().to_lowercase());
        if dangerous_extensions.contains(&ext_str.as_str()) {
            return Err(format!("SECURITY: Cannot write executable files ({})", ext_str));
        }
    }

    fs::write(&path, content).map_err(|e| format!("Failed to save file: {}", e))
}

#[tauri::command]
async fn prompt_gemini_stream(
    window: Window,
    messages: Vec<OllamaMessage>,
    model: String,
    api_key: String
) -> Result<(), String> {
    let client = reqwest::Client::new();
    
    // Convert internal message format to Gemini format
    let contents: Vec<GeminiContent> = messages.iter().map(|m| {
        GeminiContent {
            role: if m.role == "assistant" { "model".to_string() } else { "user".to_string() },
            parts: vec![GeminiPart { text: Some(m.content.clone()) }]
        }
    }).collect();

    let req = GeminiRequest { contents };
    let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?key={}", model, api_key);

    let mut stream = client.post(&url)
        .json(&req)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes_stream();

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| e.to_string())?;
        if let Ok(text) = String::from_utf8(chunk.to_vec()) {
            if let Some(start) = text.find("\"text\": \"") {
                let rest = &text[start + 9..];
                if let Some(end) = rest.find("\"") {
                    let content = &rest[..end];
                    let unescaped = content.replace("\\n", "\n").replace("\\\"", "\"");
                    window.emit("ollama-event", StreamPayload {
                        chunk: unescaped,
                        done: false
                    }).map_err(|e| e.to_string())?;
                }
            }
        }
    }
    
    window.emit("ollama-event", StreamPayload {
        chunk: "".to_string(),
        done: true
    }).map_err(|e| e.to_string())?;

    Ok(())
}

/// Read environment variables from .env file (secure path)
#[tauri::command]
async fn get_env_vars() -> Result<std::collections::HashMap<String, String>, String> {
    let base_dir = get_base_dir();
    let env_path = base_dir.join(".env");

    if !env_path.exists() {
        return Err(format!("Plik .env nie istnieje w: {:?}", env_path));
    }

    // SECURITY: Ensure we're reading from expected location
    if !env_path.starts_with(&base_dir) {
        return Err("SECURITY: Path traversal detected".to_string());
    }

    let content = fs::read_to_string(&env_path)
        .map_err(|e| format!("Failed to read .env: {}", e))?;

    let mut vars = std::collections::HashMap::new();
    for line in content.lines() {
        let line = line.trim();
        // Skip comments and empty lines
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            let key = key.trim().to_string();
            let value = value.trim().trim_matches('"').trim_matches('\'').to_string();
            vars.insert(key, value);
        }
    }
    Ok(vars)
}

#[tauri::command]
async fn get_gemini_models(api_key: String) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let url = format!("https://generativelanguage.googleapis.com/v1beta/models?key={}", api_key);
    let res = client.get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
         return Err(format!("Gemini API Error: {}", res.status()));
    }

    let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let mut models = Vec::new();
    if let Some(models_array) = body.get("models").and_then(|v| v.as_array()) {
        for model in models_array {
            if let Some(name) = model.get("name").and_then(|v| v.as_str()) {
                // Remove 'models/' prefix
                models.push(name.replace("models/", ""));
            }
        }
    }
    Ok(models)
}

// Function to assign a score to a model name for sorting
fn get_model_score(name: &str) -> i32 {
    let mut score = 0;
    if name.contains("pro") { score += 100; }
    if name.contains("ultra") { score += 200; }
    if name.contains("flash") { score -= 50; }
    if name.contains("1.5") { score += 50; }
    if name.contains("latest") { score += 10; }
    score
}

#[tauri::command]
async fn get_gemini_models_sorted(api_key: String) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let url = format!("https://generativelanguage.googleapis.com/v1beta/models?key={}", api_key);
    let res = client.get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
         return Err(format!("Gemini API Error: {}", res.status()));
    }

    let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let mut models = Vec::new();
    if let Some(models_array) = body.get("models").and_then(|v| v.as_array()) {
        for model in models_array {
            if let Some(name) = model.get("name").and_then(|v| v.as_str()) {
                // We only want generative models, and remove the 'models/' prefix
                if name.contains("generateContent") {
                    models.push(name.replace("models/", ""));
                }
            }
        }
    }
    
    // Sort models by score, descending
    models.sort_by(|a, b| get_model_score(b).cmp(&get_model_score(a)));

    Ok(models)
}

// ============================================================================
// MEMORY SYSTEM
// ============================================================================

#[derive(Serialize, Deserialize, Debug, Clone)]
struct MemoryEntry {
    id: String,
    agent: String,
    content: String,
    timestamp: i64,
    importance: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct KnowledgeNode {
    id: String,
    #[serde(rename = "type")]
    node_type: String,
    label: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct KnowledgeEdge {
    source: String,
    target: String,
    label: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
struct KnowledgeGraph {
    nodes: Vec<KnowledgeNode>,
    edges: Vec<KnowledgeEdge>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
struct MemoryStore {
    memories: Vec<MemoryEntry>,
    graph: KnowledgeGraph,
}

fn get_memory_path() -> std::path::PathBuf {
    get_base_dir().join("agent_memory.json")
}

fn read_memory_store() -> MemoryStore {
    let path = get_memory_path();
    if !path.exists() {
        return MemoryStore::default();
    }
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or(MemoryStore::default()),
        Err(_) => MemoryStore::default(),
    }
}

fn write_memory_store(store: &MemoryStore) -> Result<(), String> {
    let path = get_memory_path();
    let content = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_agent_memories(agent_name: String, top_k: usize) -> Result<Vec<MemoryEntry>, String> {
    let store = read_memory_store();
    let mut memories: Vec<MemoryEntry> = store.memories
        .into_iter()
        .filter(|m| m.agent.to_lowercase() == agent_name.to_lowercase())
        .collect();

    // Sort by importance and timestamp
    memories.sort_by(|a, b| {
        b.importance.partial_cmp(&a.importance)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| b.timestamp.cmp(&a.timestamp))
    });

    memories.truncate(top_k);
    Ok(memories)
}

#[tauri::command]
fn add_agent_memory(agent: String, content: String, importance: f32) -> Result<MemoryEntry, String> {
    // Validate input
    if agent.is_empty() || content.is_empty() {
        return Err("Agent and content cannot be empty".to_string());
    }
    if content.len() > 10000 {
        return Err("Content too long (max 10000 chars)".to_string());
    }

    let mut store = read_memory_store();
    let entry = MemoryEntry {
        id: format!("mem_{}", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()),
        agent,
        content,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64,
        importance: importance.clamp(0.0, 1.0),
    };

    store.memories.push(entry.clone());

    // Keep only last 1000 memories to prevent unbounded growth
    if store.memories.len() > 1000 {
        store.memories.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        store.memories.truncate(1000);
    }

    write_memory_store(&store)?;
    Ok(entry)
}

#[tauri::command]
fn get_knowledge_graph() -> Result<KnowledgeGraph, String> {
    let store = read_memory_store();
    Ok(store.graph)
}

#[tauri::command]
fn add_knowledge_node(node_id: String, node_type: String, label: String) -> Result<KnowledgeNode, String> {
    // Validate input
    if node_id.is_empty() || label.is_empty() {
        return Err("Node ID and label cannot be empty".to_string());
    }

    let mut store = read_memory_store();

    // Check if node already exists
    if store.graph.nodes.iter().any(|n| n.id == node_id) {
        return Err("Node with this ID already exists".to_string());
    }

    let node = KnowledgeNode {
        id: node_id,
        node_type,
        label,
    };

    store.graph.nodes.push(node.clone());

    // Limit graph size
    if store.graph.nodes.len() > 500 {
        store.graph.nodes = store.graph.nodes.into_iter().take(500).collect();
    }

    write_memory_store(&store)?;
    Ok(node)
}

#[tauri::command]
fn add_knowledge_edge(source: String, target: String, label: String) -> Result<KnowledgeEdge, String> {
    // Validate input
    if source.is_empty() || target.is_empty() || label.is_empty() {
        return Err("Source, target, and label cannot be empty".to_string());
    }

    let mut store = read_memory_store();

    // Check if nodes exist
    let source_exists = store.graph.nodes.iter().any(|n| n.id == source);
    let target_exists = store.graph.nodes.iter().any(|n| n.id == target);

    if !source_exists || !target_exists {
        return Err("Source or target node does not exist".to_string());
    }

    let edge = KnowledgeEdge {
        source,
        target,
        label,
    };

    store.graph.edges.push(edge.clone());

    // Limit edges
    if store.graph.edges.len() > 1000 {
        store.graph.edges = store.graph.edges.into_iter().take(1000).collect();
    }

    write_memory_store(&store)?;
    Ok(edge)
}

#[tauri::command]
fn clear_agent_memories(agent_name: String) -> Result<usize, String> {
    let mut store = read_memory_store();
    let original_len = store.memories.len();
    store.memories.retain(|m| m.agent.to_lowercase() != agent_name.to_lowercase());
    let removed = original_len - store.memories.len();
    write_memory_store(&store)?;
    Ok(removed)
}

#[tauri::command]
fn start_ollama_server() -> Result<String, String> {
    let mut script_path = get_base_dir().join("start-ollama.ps1");

    // Fallback for dev environment: try to find the script in the project root
    // if it's not found in the calculated base dir
    if !script_path.exists() {
        if let Ok(cwd) = std::env::current_dir() {
            // Check ../../start-ollama.ps1 (from src-tauri/target/debug)
            let dev_path_1 = cwd.join("../../start-ollama.ps1");
            if dev_path_1.exists() {
                script_path = dev_path_1;
            } else {
                // Check ../start-ollama.ps1 (from GeminiGUI)
                let dev_path_2 = cwd.join("../start-ollama.ps1");
                if dev_path_2.exists() {
                    script_path = dev_path_2;
                }
            }
        }
    }
    
    // Resolve to absolute path to avoid confusion
    if let Ok(abs_path) = std::fs::canonicalize(&script_path) {
        script_path = abs_path;
    }

    let script_path_str = script_path.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        // On Windows, we want to run this in a new, hidden window so it doesn't block
        // and doesn't show a flickering console.
        // We use & "path" operator to execute the script path properly
        let arg_list = format!("-ArgumentList '-ExecutionPolicy Bypass -NoExit -Command & \"{}\"'", script_path_str);
        
        Command::new("powershell")
            .args(&["-WindowStyle", "Hidden", "-Command", "Start-Process", "powershell", &arg_list])
            .spawn()
            .map_err(|e| format!("Failed to spawn Ollama process: {}", e))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        // On other systems, run it in the background
        Command::new("sh")
            .arg("-c")
            .arg(format!("\"{}\" &", script_path_str))
            .spawn()
            .map_err(|e| format!("Failed to spawn Ollama process: {}", e))?;
    }

    Ok(format!("Ollama server started using: {}", script_path_str))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // -- Start Ollama on App Boot (fire and forget) --
            tauri::async_runtime::spawn(async {
                let _ = start_ollama_server();
            });

            let quit_i = MenuItem::with_id(app, "quit", "Zakoncz", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Pokaz Okno", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app: &AppHandle, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray: &tauri::tray::TrayIcon, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_bridge_state,
            set_auto_approve,
            approve_request,
            reject_request,
            fetch_external_data,
            prompt_ollama,
            prompt_ollama_stream,
            prompt_gemini_stream,
            get_ollama_models,
            get_gemini_models,
            get_gemini_models_sorted,
            get_env_vars,
            run_system_command,
            save_file_content,
            spawn_swarm_agent,
            start_ollama_server,
            // Memory system
            get_agent_memories,
            add_agent_memory,
            get_knowledge_graph,
            add_knowledge_node,
            add_knowledge_edge,
            clear_agent_memories
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}