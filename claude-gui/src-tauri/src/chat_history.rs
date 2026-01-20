use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{command, AppHandle, Manager};

/// Single chat message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub role: String, // "user", "assistant", "system"
    pub content: String,
    pub timestamp: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens: Option<u64>,
}

/// Chat session metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSession {
    pub id: String,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub message_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default)]
    pub messages: Vec<ChatMessage>,
}

/// Summary of chat session (without messages)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSessionSummary {
    pub id: String,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub message_count: usize,
    pub model: Option<String>,
    pub preview: String, // First ~100 chars of first message
}

impl ChatSession {
    pub fn new(title: String) -> Self {
        let now = Utc::now();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            title,
            created_at: now,
            updated_at: now,
            message_count: 0,
            model: None,
            messages: Vec::new(),
        }
    }

    pub fn add_message(&mut self, role: String, content: String, model: Option<String>) -> ChatMessage {
        let msg = ChatMessage {
            id: uuid::Uuid::new_v4().to_string(),
            role,
            content,
            timestamp: Utc::now(),
            model: model.clone(),
            tokens: None,
        };
        self.messages.push(msg.clone());
        self.message_count = self.messages.len();
        self.updated_at = Utc::now();
        if self.model.is_none() {
            self.model = model;
        }
        msg
    }

    pub fn to_summary(&self) -> ChatSessionSummary {
        let preview = self
            .messages
            .first()
            .map(|m| {
                if m.content.len() > 100 {
                    format!("{}...", &m.content[..100])
                } else {
                    m.content.clone()
                }
            })
            .unwrap_or_default();

        ChatSessionSummary {
            id: self.id.clone(),
            title: self.title.clone(),
            created_at: self.created_at,
            updated_at: self.updated_at,
            message_count: self.message_count,
            model: self.model.clone(),
            preview,
        }
    }
}

/// Get the chat history directory
fn get_chat_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let chat_dir = app_data.join("chats");

    if !chat_dir.exists() {
        fs::create_dir_all(&chat_dir)
            .map_err(|e| format!("Failed to create chat dir: {}", e))?;
    }

    Ok(chat_dir)
}

/// List all chat sessions
#[command]
pub async fn list_chat_sessions(app: AppHandle) -> Result<Vec<ChatSessionSummary>, String> {
    let chat_dir = get_chat_dir(&app)?;
    let mut sessions: Vec<ChatSessionSummary> = Vec::new();

    let entries = fs::read_dir(&chat_dir)
        .map_err(|e| format!("Failed to read chat dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map(|e| e == "json").unwrap_or(false) {
            match fs::read_to_string(&path) {
                Ok(content) => {
                    if let Ok(session) = serde_json::from_str::<ChatSession>(&content) {
                        sessions.push(session.to_summary());
                    }
                }
                Err(e) => {
                    tracing::warn!("Failed to read chat file {:?}: {}", path, e);
                }
            }
        }
    }

    // Sort by updated_at descending
    sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    Ok(sessions)
}

/// Get a specific chat session with all messages
#[command]
pub async fn get_chat_session(app: AppHandle, session_id: String) -> Result<ChatSession, String> {
    let chat_dir = get_chat_dir(&app)?;
    let file_path = chat_dir.join(format!("{}.json", session_id));

    if !file_path.exists() {
        return Err(format!("Chat session not found: {}", session_id));
    }

    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read chat file: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse chat file: {}", e))
}

/// Create a new chat session
#[command]
pub async fn create_chat_session(app: AppHandle, title: String) -> Result<ChatSession, String> {
    let chat_dir = get_chat_dir(&app)?;
    let session = ChatSession::new(title);

    let file_path = chat_dir.join(format!("{}.json", session.id));
    let content = serde_json::to_string_pretty(&session)
        .map_err(|e| format!("Failed to serialize session: {}", e))?;

    fs::write(&file_path, content)
        .map_err(|e| format!("Failed to write chat file: {}", e))?;

    Ok(session)
}

/// Add a message to a chat session
#[command]
pub async fn add_chat_message(
    app: AppHandle,
    session_id: String,
    role: String,
    content: String,
    model: Option<String>,
) -> Result<ChatMessage, String> {
    let chat_dir = get_chat_dir(&app)?;
    let file_path = chat_dir.join(format!("{}.json", session_id));

    if !file_path.exists() {
        return Err(format!("Chat session not found: {}", session_id));
    }

    let file_content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read chat file: {}", e))?;

    let mut session: ChatSession = serde_json::from_str(&file_content)
        .map_err(|e| format!("Failed to parse chat file: {}", e))?;

    let message = session.add_message(role, content, model);

    let new_content = serde_json::to_string_pretty(&session)
        .map_err(|e| format!("Failed to serialize session: {}", e))?;

    fs::write(&file_path, new_content)
        .map_err(|e| format!("Failed to write chat file: {}", e))?;

    Ok(message)
}

/// Delete a chat session
#[command]
pub async fn delete_chat_session(app: AppHandle, session_id: String) -> Result<(), String> {
    let chat_dir = get_chat_dir(&app)?;
    let file_path = chat_dir.join(format!("{}.json", session_id));

    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete chat file: {}", e))?;
    }

    Ok(())
}

/// Update chat session title
#[command]
pub async fn update_chat_title(
    app: AppHandle,
    session_id: String,
    title: String,
) -> Result<ChatSession, String> {
    let chat_dir = get_chat_dir(&app)?;
    let file_path = chat_dir.join(format!("{}.json", session_id));

    if !file_path.exists() {
        return Err(format!("Chat session not found: {}", session_id));
    }

    let file_content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read chat file: {}", e))?;

    let mut session: ChatSession = serde_json::from_str(&file_content)
        .map_err(|e| format!("Failed to parse chat file: {}", e))?;

    session.title = title;
    session.updated_at = Utc::now();

    let new_content = serde_json::to_string_pretty(&session)
        .map_err(|e| format!("Failed to serialize session: {}", e))?;

    fs::write(&file_path, new_content)
        .map_err(|e| format!("Failed to write chat file: {}", e))?;

    Ok(session)
}

/// Clear all chat history
#[command]
pub async fn clear_all_chats(app: AppHandle) -> Result<(), String> {
    let chat_dir = get_chat_dir(&app)?;

    let entries = fs::read_dir(&chat_dir)
        .map_err(|e| format!("Failed to read chat dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map(|e| e == "json").unwrap_or(false) {
            let _ = fs::remove_file(path);
        }
    }

    Ok(())
}
