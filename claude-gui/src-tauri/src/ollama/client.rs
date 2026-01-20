use futures_util::StreamExt;
use reqwest::Client;
use tauri::{Emitter, Window};

use super::types::*;

const DEFAULT_OLLAMA_URL: &str = "http://127.0.0.1:11434";

pub struct OllamaClient {
    client: Client,
    base_url: String,
}

impl OllamaClient {
    pub fn new(base_url: Option<String>) -> Self {
        Self {
            client: Client::new(),
            base_url: base_url.unwrap_or_else(|| DEFAULT_OLLAMA_URL.to_string()),
        }
    }

    /// List available models
    pub async fn list_models(&self) -> Result<Vec<OllamaModel>, String> {
        let url = format!("{}/api/tags", self.base_url);

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Ollama API error: {}", response.status()));
        }

        let models: OllamaModelsResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        Ok(models.models)
    }

    /// Generate completion with streaming
    pub async fn generate_stream(
        &self,
        window: &Window,
        request_id: &str,
        model: &str,
        prompt: &str,
        system: Option<String>,
    ) -> Result<String, String> {
        let url = format!("{}/api/generate", self.base_url);

        let request = OllamaRequest {
            model: model.to_string(),
            prompt: prompt.to_string(),
            stream: true,
            system,
            context: None,
        };

        let response = self
            .client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Ollama API error: {}", response.status()));
        }

        let mut stream = response.bytes_stream();
        let mut full_response = String::new();

        while let Some(chunk_result) = stream.next().await {
            match chunk_result {
                Ok(bytes) => {
                    // Parse NDJSON line
                    let text = String::from_utf8_lossy(&bytes);
                    for line in text.lines() {
                        if line.is_empty() {
                            continue;
                        }

                        match serde_json::from_str::<OllamaStreamResponse>(line) {
                            Ok(chunk) => {
                                full_response.push_str(&chunk.response);

                                // Emit chunk to frontend
                                let stream_chunk = StreamChunk {
                                    id: request_id.to_string(),
                                    token: chunk.response,
                                    done: chunk.done,
                                    model: Some(chunk.model),
                                    total_tokens: chunk.eval_count,
                                };

                                let _ = window.emit("ollama-stream-chunk", &stream_chunk);

                                if chunk.done {
                                    break;
                                }
                            }
                            Err(e) => {
                                tracing::warn!("Failed to parse chunk: {} - {}", line, e);
                            }
                        }
                    }
                }
                Err(e) => {
                    return Err(format!("Stream error: {}", e));
                }
            }
        }

        Ok(full_response)
    }

    /// Chat completion with streaming
    pub async fn chat_stream(
        &self,
        window: &Window,
        request_id: &str,
        model: &str,
        messages: Vec<ChatMessage>,
    ) -> Result<String, String> {
        let url = format!("{}/api/chat", self.base_url);

        let request = OllamaChatRequest {
            model: model.to_string(),
            messages,
            stream: true,
        };

        let response = self
            .client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Ollama API error: {}", response.status()));
        }

        let mut stream = response.bytes_stream();
        let mut full_response = String::new();

        while let Some(chunk_result) = stream.next().await {
            match chunk_result {
                Ok(bytes) => {
                    let text = String::from_utf8_lossy(&bytes);
                    for line in text.lines() {
                        if line.is_empty() {
                            continue;
                        }

                        match serde_json::from_str::<OllamaChatStreamResponse>(line) {
                            Ok(chunk) => {
                                let token = chunk
                                    .message
                                    .as_ref()
                                    .map(|m| m.content.clone())
                                    .unwrap_or_default();

                                full_response.push_str(&token);

                                let stream_chunk = StreamChunk {
                                    id: request_id.to_string(),
                                    token,
                                    done: chunk.done,
                                    model: Some(chunk.model),
                                    total_tokens: chunk.eval_count,
                                };

                                let _ = window.emit("ollama-stream-chunk", &stream_chunk);

                                if chunk.done {
                                    break;
                                }
                            }
                            Err(e) => {
                                tracing::warn!("Failed to parse chat chunk: {} - {}", line, e);
                            }
                        }
                    }
                }
                Err(e) => {
                    return Err(format!("Stream error: {}", e));
                }
            }
        }

        Ok(full_response)
    }

    /// Check if Ollama is running
    pub async fn health_check(&self) -> Result<bool, String> {
        let url = format!("{}/api/tags", self.base_url);

        match self.client.get(&url).send().await {
            Ok(response) => Ok(response.status().is_success()),
            Err(_) => Ok(false),
        }
    }

    /// Generate completion synchronously (no streaming events)
    pub async fn generate_sync(
        &self,
        model: &str,
        prompt: &str,
        options: Option<GenerateOptions>,
    ) -> Result<String, String> {
        let url = format!("{}/api/generate", self.base_url);

        let request = OllamaRequestSync {
            model: model.to_string(),
            prompt: prompt.to_string(),
            stream: false,
            options,
        };

        let response = self
            .client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Ollama API error: {}", response.status()));
        }

        let result: OllamaSyncResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        Ok(result.response)
    }
}

impl Default for OllamaClient {
    fn default() -> Self {
        Self::new(None)
    }
}
