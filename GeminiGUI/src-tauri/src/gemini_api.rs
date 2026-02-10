// ============================================================================
// GEMINI API: Structs, streaming, and API commands
// ============================================================================

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Window};

use crate::get_base_dir;

// ── Data Structures ──

#[derive(Serialize, Deserialize, Debug)]
pub struct GeminiPart {
    pub text: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct GeminiContent {
    pub role: String,
    pub parts: Vec<GeminiPart>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct GeminiSystemInstruction {
    pub parts: Vec<GeminiPart>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GeminiGenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<u32>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GeminiRequest {
    pub contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_instruction: Option<GeminiSystemInstruction>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generation_config: Option<GeminiGenerationConfig>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GeminiMessage {
    pub role: String,
    pub content: String,
}

#[derive(Clone, Serialize)]
pub struct StreamPayload {
    pub chunk: String,
    pub done: bool,
}

#[derive(Clone, Serialize)]
pub struct DownloadProgressPayload {
    pub filename: String,
    pub downloaded: u64,
    pub total: u64,
    pub speed_bps: u64,
    pub percentage: f32,
    pub complete: bool,
    pub error: Option<String>,
}

// ============================================================================
// JSON STREAMING PARSER HELPER
// ============================================================================

/// Extract all `"text": "..."` values from a raw JSON stream chunk.
/// Handles both `"text": "` and `"text":"` (with/without space after colon).
/// Handles escaped quotes (`\"`) inside values, escaped backslashes (`\\`),
/// unicode escapes (`\uXXXX`), and performs bounds checking to avoid panics
/// on malformed input.  Caps per-value length at 1 MB to bound memory usage.
/// Returns a Vec of unescaped text strings found in the chunk.
pub fn extract_text_values(raw: &str) -> Vec<String> {
    // Two needle variants: with and without space after the colon.
    let needles: &[&str] = &["\"text\": \"", "\"text\":\""];
    let mut results = Vec::new();
    let bytes = raw.as_bytes();
    let mut pos = 0;

    // Safety limit: never produce more than 256 values from a single chunk.
    const MAX_RESULTS: usize = 256;
    // Safety limit: single value cannot exceed 1 MB of decoded text.
    const MAX_VALUE_LEN: usize = 1_048_576;

    while pos < bytes.len() && results.len() < MAX_RESULTS {
        // Find the earliest occurrence of any needle variant
        let mut best: Option<(usize, usize)> = None; // (offset_in_raw, needle_len)
        let remaining = &raw[pos..];
        for needle in needles {
            if let Some(offset) = remaining.find(needle) {
                let abs_offset = pos + offset;
                if best.is_none() || abs_offset < best.unwrap().0 {
                    best = Some((abs_offset, needle.len()));
                }
            }
        }

        let (match_start, needle_len) = match best {
            Some(b) => b,
            None => break,
        };

        // Move past the needle to the start of the value
        let value_start = match_start + needle_len;
        if value_start >= bytes.len() {
            break;
        }

        // Walk through the value, respecting escaped characters
        let mut end = value_start;
        let mut value = String::new();
        let mut truncated = false;
        while end < bytes.len() {
            if value.len() >= MAX_VALUE_LEN {
                truncated = true;
                break;
            }
            let ch = bytes[end];
            if ch == b'\\' {
                // Escaped character: consume the next byte
                if end + 1 < bytes.len() {
                    let next = bytes[end + 1];
                    match next {
                        b'n' => value.push('\n'),
                        b't' => value.push('\t'),
                        b'r' => value.push('\r'),
                        b'"' => value.push('"'),
                        b'\\' => value.push('\\'),
                        b'/' => value.push('/'),
                        // Unicode escapes (\uXXXX) - decode if we have 4 hex digits
                        b'u' => {
                            if end + 5 < bytes.len() {
                                let hex = &raw[end + 2..end + 6];
                                if let Ok(code) = u32::from_str_radix(hex, 16) {
                                    if let Some(c) = char::from_u32(code) {
                                        value.push(c);
                                    } else {
                                        // Invalid codepoint, emit replacement char
                                        value.push('\u{FFFD}');
                                    }
                                    end += 6;
                                    continue;
                                }
                            }
                            // Not enough digits or invalid hex, pass through
                            value.push('\\');
                            value.push('u');
                        }
                        _ => {
                            // Unknown escape, preserve literally
                            value.push('\\');
                            // Decode next byte as part of UTF-8 sequence
                            let rest = &raw[end + 1..];
                            if let Some(c) = rest.chars().next() {
                                value.push(c);
                            } else {
                                value.push(next as char);
                            }
                        }
                    }
                    end += 2;
                } else {
                    // Trailing backslash at end of chunk - malformed, stop
                    break;
                }
            } else if ch == b'"' {
                // Unescaped quote - end of value
                break;
            } else {
                // Decode multi-byte UTF-8 characters properly.
                let rest = &raw[end..];
                if let Some(c) = rest.chars().next() {
                    value.push(c);
                    end += c.len_utf8();
                } else {
                    // Should not happen on valid UTF-8, but skip the byte
                    end += 1;
                }
            }
        }

        if truncated {
            // Value exceeded safety limit; skip to find next potential match
            while end < bytes.len() && bytes[end] != b'"' {
                if bytes[end] == b'\\' && end + 1 < bytes.len() {
                    end += 2;
                } else {
                    end += 1;
                }
            }
            results.push(value);
            pos = if end < bytes.len() { end + 1 } else { end };
        } else if end < bytes.len() && bytes[end] == b'"' {
            results.push(value);
            pos = end + 1;
        } else {
            pos = value_start;
            break;
        }
    }

    results
}

// ============================================================================
// .env HELPERS
// ============================================================================

/// Helper: find .env file by searching upward from executable directory
pub fn find_env_file() -> Option<std::path::PathBuf> {
    let base = get_base_dir();
    let mut dir = base.as_path();
    for _ in 0..6 {
        let candidate = dir.join(".env");
        if candidate.exists() {
            return Some(candidate);
        }
        dir = match dir.parent() {
            Some(p) => p,
            None => break,
        };
    }
    None
}

/// Helper: read a specific key from .env file
pub fn read_env_key(keys: &[&str]) -> Result<String, String> {
    let env_path = find_env_file()
        .ok_or_else(|| "Nie znaleziono pliku .env — ustaw GEMINI_API_KEY w Ustawieniach lub utwórz plik .env".to_string())?;

    let content = std::fs::read_to_string(&env_path)
        .map_err(|e| format!("Nie można odczytać .env: {}", e))?;

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            let key = key.trim();
            let value = value.trim().trim_matches('"').trim_matches('\'');
            if keys.contains(&key) && !value.is_empty() {
                return Ok(value.to_string());
            }
        }
    }
    Err(format!(
        "Brak klucza API w .env (szukano: {})",
        keys.join(", ")
    ))
}

// ============================================================================
// TAURI COMMANDS
// ============================================================================

#[tauri::command]
pub async fn prompt_gemini_stream(
    window: Window,
    messages: Vec<GeminiMessage>,
    model: String,
    api_key: String,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let contents: Vec<GeminiContent> = messages
        .iter()
        .map(|m| GeminiContent {
            role: if m.role == "assistant" {
                "model".to_string()
            } else {
                "user".to_string()
            },
            parts: vec![GeminiPart {
                text: Some(m.content.clone()),
            }],
        })
        .collect();

    let req = GeminiRequest {
        contents,
        system_instruction: None,
        generation_config: Some(GeminiGenerationConfig {
            temperature: Some(1.0),
            max_output_tokens: Some(65536),
        }),
    };
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent",
        model
    );

    let mut stream = client
        .post(&url)
        .header("x-goog-api-key", &api_key)
        .json(&req)
        .send()
        .await
        .map_err(|e| format!("Gemini stream request failed: {}", e))?
        .bytes_stream();

    while let Some(item) = stream.next().await {
        let chunk = match item {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Gemini stream chunk error: {}", e);
                continue;
            }
        };
        if let Ok(text) = String::from_utf8(chunk.to_vec()) {
            for extracted in extract_text_values(&text) {
                window
                    .emit(
                        "llama-stream",
                        StreamPayload {
                            chunk: extracted,
                            done: false,
                        },
                    )
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    window
        .emit(
            "llama-stream",
            StreamPayload {
                chunk: "".to_string(),
                done: true,
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_gemini_models(api_key: String) -> Result<Vec<String>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let url = "https://generativelanguage.googleapis.com/v1beta/models";
    let res = client
        .get(url)
        .header("x-goog-api-key", &api_key)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Gemini models: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Gemini API Error: {}", res.status()));
    }

    let body: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse models response: {}", e))?;

    let mut models = Vec::new();
    if let Some(models_array) = body.get("models").and_then(|v| v.as_array()) {
        for model in models_array {
            if let Some(name) = model.get("name").and_then(|v| v.as_str()) {
                models.push(name.replace("models/", ""));
            }
        }
    }
    Ok(models)
}

#[tauri::command]
pub async fn get_env_vars() -> Result<std::collections::HashMap<String, String>, String> {
    let base_dir = get_base_dir();
    let env_path = base_dir.join(".env");

    if !env_path.exists() {
        return Err(format!("Plik .env nie istnieje w: {:?}", env_path));
    }

    if !env_path.starts_with(&base_dir) {
        return Err("SECURITY: Path traversal detected".to_string());
    }

    let content =
        std::fs::read_to_string(&env_path).map_err(|e| format!("Failed to read .env: {}", e))?;

    let mut vars = std::collections::HashMap::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            let key = key.trim().to_string();
            let value = value
                .trim()
                .trim_matches('"')
                .trim_matches('\'')
                .to_string();
            vars.insert(key, value);
        }
    }
    Ok(vars)
}

#[tauri::command]
pub async fn chat_with_gemini(
    window: Window,
    messages: Vec<GeminiMessage>,
    model: Option<String>,
    system_prompt: Option<String>,
    temperature: Option<f32>,
    max_output_tokens: Option<u32>,
) -> Result<(), String> {
    // 1. Read API key from .env
    let api_key = read_env_key(&["GEMINI_API_KEY", "GOOGLE_API_KEY"])?;

    // 2. Choose model
    let model_name = model.unwrap_or_else(|| "gemini-3-pro-preview".to_string());

    // 3. Build Gemini request
    let contents: Vec<GeminiContent> = messages
        .iter()
        .map(|m| GeminiContent {
            role: if m.role == "assistant" {
                "model".to_string()
            } else {
                "user".to_string()
            },
            parts: vec![GeminiPart {
                text: Some(m.content.clone()),
            }],
        })
        .collect();

    let system_instruction = system_prompt
        .filter(|s| !s.trim().is_empty())
        .map(|s| GeminiSystemInstruction {
            parts: vec![GeminiPart { text: Some(s) }],
        });

    let req = GeminiRequest {
        contents,
        system_instruction,
        generation_config: Some(GeminiGenerationConfig {
            temperature: Some(temperature.unwrap_or(1.0)),
            max_output_tokens: Some(max_output_tokens.unwrap_or(65536)),
        }),
    };
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent",
        model_name
    );

    // 4. Create HTTP client and send
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let response = client
        .post(&url)
        .header("x-goog-api-key", &api_key)
        .json(&req)
        .send()
        .await
        .map_err(|e| format!("Gemini request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Gemini API error {}: {}", status, body));
    }

    // 5. Stream response chunks
    let mut stream = response.bytes_stream();
    while let Some(item) = stream.next().await {
        let chunk = match item {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Gemini stream chunk error: {}", e);
                continue;
            }
        };
        if let Ok(text) = String::from_utf8(chunk.to_vec()) {
            for extracted in extract_text_values(&text) {
                window
                    .emit(
                        "gemini-stream",
                        StreamPayload {
                            chunk: extracted,
                            done: false,
                        },
                    )
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    // 6. Signal completion
    window
        .emit(
            "gemini-stream",
            StreamPayload {
                chunk: String::new(),
                done: true,
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}
