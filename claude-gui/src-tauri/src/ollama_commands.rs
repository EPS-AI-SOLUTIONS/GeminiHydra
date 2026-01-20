use tauri::{command, State, Window};
use tokio::sync::RwLock;
use std::sync::Arc;

use crate::ollama::client::OllamaClient;
use crate::ollama::types::{ChatMessage, GenerateOptions, OllamaModel};

pub struct OllamaState {
    pub client: Arc<RwLock<OllamaClient>>,
}

impl OllamaState {
    pub fn new() -> Self {
        Self {
            client: Arc::new(RwLock::new(OllamaClient::default())),
        }
    }
}

impl Default for OllamaState {
    fn default() -> Self {
        Self::new()
    }
}

/// List available Ollama models
#[command]
pub async fn ollama_list_models(state: State<'_, OllamaState>) -> Result<Vec<OllamaModel>, String> {
    let client = state.client.read().await;
    client.list_models().await
}

/// Check if Ollama is running
#[command]
pub async fn ollama_health_check(state: State<'_, OllamaState>) -> Result<bool, String> {
    let client = state.client.read().await;
    client.health_check().await
}

/// Generate completion with streaming
#[command]
pub async fn ollama_generate(
    state: State<'_, OllamaState>,
    window: Window,
    model: String,
    prompt: String,
    system: Option<String>,
) -> Result<String, String> {
    let request_id = uuid::Uuid::new_v4().to_string();
    let client = state.client.read().await;

    client
        .generate_stream(&window, &request_id, &model, &prompt, system)
        .await
}

/// Chat completion with streaming
#[command]
pub async fn ollama_chat(
    state: State<'_, OllamaState>,
    window: Window,
    model: String,
    messages: Vec<ChatMessage>,
) -> Result<String, String> {
    let request_id = uuid::Uuid::new_v4().to_string();
    let client = state.client.read().await;

    client.chat_stream(&window, &request_id, &model, messages).await
}

/// Configure Ollama base URL
#[command]
pub async fn ollama_set_url(state: State<'_, OllamaState>, url: String) -> Result<(), String> {
    let mut client = state.client.write().await;
    *client = OllamaClient::new(Some(url));
    Ok(())
}

/// Generate completion synchronously (no streaming, for AI metadata tasks)
#[command]
pub async fn ollama_generate_sync(
    state: State<'_, OllamaState>,
    model: String,
    prompt: String,
    options: Option<GenerateOptions>,
) -> Result<String, String> {
    let client = state.client.read().await;
    client.generate_sync(&model, &prompt, options).await
}
