// ---------------------------------------------------------------------------
// handlers/execute.rs — Legacy HTTP execute + internal tool bridge
// ---------------------------------------------------------------------------

use std::time::Instant;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::models::{ExecutePlan, ExecuteRequest, ExecuteResponse};
use crate::state::AppState;

use crate::context::prepare_execution;
use crate::error::ApiError;
use crate::prompt::build_thinking_config;

use super::gemini_diagnose;

// ---------------------------------------------------------------------------
// ADK Internal Tool Bridge
// ---------------------------------------------------------------------------

/// POST /api/internal/tool — Internal tool execution bridge for ADK sidecar.
/// Only reachable from localhost (ADK sidecar). Exposes tools::execute_tool via HTTP.
pub async fn internal_tool_execute(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let name = body["name"]
        .as_str()
        .ok_or_else(|| ApiError::BadRequest("missing 'name' field".into()))?;
    let args = body.get("args").cloned().unwrap_or(json!({}));

    // Read working_directory from settings for tool path resolution
    let wd: String = sqlx::query_scalar("SELECT working_directory FROM gh_settings WHERE id = 1")
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to read working_directory from DB: {}", e);
            ApiError::Internal("Database error reading settings".into())
        })?;

    match crate::tools::execute_tool(name, &args, &state, &wd).await {
        Ok(output) => Ok(Json(json!({
            "status": "success",
            "result": output.text
        }))),
        Err(e) => Ok(Json(json!({
            "status": "error",
            "result": e
        }))),
    }
}

// ---------------------------------------------------------------------------
// HTTP Execute (Legacy)
// ---------------------------------------------------------------------------

/// Gemini retry helper — reuses the same backoff logic as streaming.
/// This is a simplified version for the non-streaming execute endpoint.
async fn gemini_request_simple(
    client: &reqwest::Client,
    url: &reqwest::Url,
    api_key: &str,
    is_oauth: bool,
    body: &Value,
) -> Result<reqwest::Response, String> {
    let result = crate::oauth::apply_google_auth(client.post(url.clone()), api_key, is_oauth)
        .json(body)
        .timeout(std::time::Duration::from_secs(300))
        .send()
        .await;

    match result {
        Ok(resp) if resp.status().is_success() => Ok(resp),
        Ok(resp) => {
            let status = resp.status();
            let err_body = resp.text().await.unwrap_or_default();
            let safe_len = err_body
                .char_indices()
                .take_while(|(i, _)| *i < 500)
                .last()
                .map(|(i, c)| i + c.len_utf8())
                .unwrap_or(0);
            Err(format!(
                "Gemini API error ({}): {}",
                status,
                &err_body[..safe_len]
            ))
        }
        Err(e) => Err(format!("Gemini API request failed: {:?}", e)),
    }
}


#[utoipa::path(post, path = "/api/execute", tag = "chat",
    request_body = ExecuteRequest,
    responses((status = 200, description = "Execution result", body = ExecuteResponse))
)]
pub async fn execute(
    State(state): State<AppState>,
    Json(body): Json<ExecuteRequest>,
) -> (StatusCode, Json<Value>) {
    if body.prompt.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Prompt cannot be empty" })),
        );
    }
    let start = std::time::Instant::now();

    let mode_override = if !body.mode.is_empty() && body.mode != "auto" {
        let agents = state.agents.read().await;
        agents
            .iter()
            .find(|a| a.id == body.mode || a.name.to_lowercase() == body.mode.to_lowercase())
            .map(|a| {
                (
                    a.id.clone(),
                    0.99_f64,
                    "User explicitly selected agent via mode field".to_string(),
                )
            })
    } else {
        None
    };
    let ctx = prepare_execution(&state, &body.prompt, body.model.clone(), mode_override, "").await;
    if ctx.api_key.is_empty() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "No API Key" })),
        );
    }

    if let Err(msg) = state.gemini_circuit.check().await {
        tracing::warn!("execute: {}", msg);
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": msg })),
        );
    }

    // Dynamic base URL based on project
    let base_url = if cfg!(feature = "deepseek") || env!("CARGO_PKG_NAME").contains("DeepSeek") {
        "https://api.deepseek.com/chat/completions"
    } else if cfg!(feature = "grok") || env!("CARGO_PKG_NAME").contains("Grok") {
        "https://api.x.ai/v1/chat/completions"
    } else {
        "https://api.openai.com/v1/chat/completions"
    };

    let parsed_url = reqwest::Url::parse(base_url).unwrap();
    
    let req_body = json!({
        "model": ctx.model,
        "messages": [
            { "role": "system", "content": ctx.system_prompt },
            { "role": "user", "content": ctx.final_user_prompt }
        ],
        "temperature": ctx.temperature,
        "top_p": ctx.top_p,
        "max_completion_tokens": ctx.max_tokens
    });

    let extract_text = |j: &Value| -> Option<String> {
        j.get("choices")
            .and_then(|c| c.get(0))
            .and_then(|c0| c0.get("message"))
            .and_then(|m| m.get("content"))
            .and_then(|t| t.as_str())
            .map(|s| s.to_string())
    };

    let text = match gemini_request_simple(
        &state.client,
        &parsed_url,
        &ctx.api_key,
        ctx.is_oauth,
        &req_body,
    )
    .await
    {
        Ok(r) => {
            state.gemini_circuit.record_success().await;
            let j: Value = r.json().await.unwrap_or_default();
            if let Some(text) = extract_text(&j) {
                text
            } else {
                tracing::error!("execute: OpenAI response missing text: {:?}", j);
                format!("API returned no text. Response: {:?}", j)
            }
        }
        Err(e) => {
            state.gemini_circuit.record_failure().await;
            tracing::error!("execute: {}", e);
            "API Error".to_string()
        }
    };

    (
        StatusCode::OK,
        Json(json!(ExecuteResponse {
            id: uuid::Uuid::new_v4().to_string(),
            result: text,
            plan: Some(ExecutePlan {
                agent: Some(ctx.agent_id),
                steps: ctx.steps,
                estimated_time: None
            }),
            duration_ms: start.elapsed().as_millis() as u64,
            mode: body.mode,
            files_loaded: ctx.files_loaded,
        })),
    )
}
