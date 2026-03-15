// ---------------------------------------------------------------------------
// handlers/system.rs — Health, readiness, system stats, auth mode, models, admin
//
// Generic health/system handlers are delegated to the shared jaskier-core
// crate via HasHealthState. Only app-specific endpoints remain here.
// ---------------------------------------------------------------------------

use axum::Json;
use axum::extract::State;
use serde_json::{Value, json};

use jaskier_core::error::ApiError;
use crate::models::{GeminiModelInfo, GeminiModelsResponse};
use crate::state::AppState;

// ── Re-exports of shared response types ──────────────────────────────────────

pub use jaskier_core::handlers::system::{
    DetailedHealthResponse, HealthResponse, ProxyHistoryParams, ProxyHistoryResponse,
    SystemStats,
};

// ── Shared handler wrappers (concrete AppState) ───────────────────────────────

#[utoipa::path(get, path = "/api/health", tag = "health",
    responses((status = 200, description = "Health check with provider status", body = HealthResponse))
)]
pub async fn health(state: State<AppState>) -> Json<HealthResponse> {
    jaskier_core::handlers::system::health(state).await
}

#[utoipa::path(get, path = "/api/health/ready", tag = "health",
    responses(
        (status = 200, description = "Service ready", body = Value),
        (status = 503, description = "Service not ready", body = Value)
    )
)]
pub async fn readiness(state: State<AppState>) -> axum::response::Response {
    jaskier_core::handlers::system::readiness(state).await
}

#[utoipa::path(get, path = "/api/auth/mode", tag = "auth",
    responses((status = 200, description = "Auth mode info", body = Value))
)]
pub async fn auth_mode(state: State<AppState>) -> Json<Value> {
    jaskier_core::handlers::system::auth_mode(state).await
}

#[utoipa::path(get, path = "/api/health/detailed", tag = "health",
    responses((status = 200, description = "Detailed health with system metrics", body = DetailedHealthResponse))
)]
pub async fn health_detailed(state: State<AppState>) -> Json<DetailedHealthResponse> {
    jaskier_core::handlers::system::health_detailed(state).await
}

#[utoipa::path(get, path = "/api/system/stats", tag = "system",
    responses((status = 200, description = "System resource usage", body = SystemStats))
)]
pub async fn system_stats(state: State<AppState>) -> Json<SystemStats> {
    jaskier_core::handlers::system::system_stats(state).await
}

pub async fn system_audit() -> Json<Value> {
    jaskier_core::handlers::system::system_audit().await
}

#[utoipa::path(
    get,
    path = "/api/browser-proxy/history",
    tag = "health",
    params(
        ("limit" = Option<usize>, Query, description = "Max events to return (default 50, max 50)")
    ),
    responses(
        (status = 200, description = "Proxy health history events", body = ProxyHistoryResponse)
    )
)]
pub async fn browser_proxy_history(
    state: State<AppState>,
    query: axum::extract::Query<ProxyHistoryParams>,
) -> Json<ProxyHistoryResponse> {
    jaskier_core::handlers::system::browser_proxy_history(state, query).await
}

// ── Admin — Key Rotation (shared generic handler) ────────────────────────────

pub async fn rotate_key(
    state: State<AppState>,
    body: Json<Value>,
) -> Result<Json<Value>, ApiError> {
    jaskier_core::handlers::system::rotate_key(state, body).await
}

// ---------------------------------------------------------------------------
// Gemini Models — app-specific (uses local OAuth helpers)
// ---------------------------------------------------------------------------

#[utoipa::path(get, path = "/api/gemini/models", tag = "models",
    responses((status = 200, description = "Available Gemini models", body = GeminiModelsResponse))
)]
pub async fn gemini_models(State(state): State<AppState>) -> Json<Value> {
    let mut models = Vec::new();

    let google_cred = crate::oauth::get_google_credential(&state).await;
    if let Some((key, is_oauth)) = google_cred {
        let url = "https://generativelanguage.googleapis.com/v1beta/models";
        if let Ok(parsed) = reqwest::Url::parse(url)
            && let Ok(res) =
                crate::oauth::apply_google_auth(state.client.get(parsed), &key, is_oauth)
                    .send()
                    .await
            && res.status().is_success()
            && let Ok(body) = res.json::<Value>().await
            && let Some(list) = body["models"].as_array()
        {
            models.extend(list.iter().filter_map(|m| {
                let info: GeminiModelInfo = serde_json::from_value(m.clone()).ok()?;
                if info
                    .supported_generation_methods
                    .contains(&"generateContent".to_string())
                {
                    Some(info)
                } else {
                    None
                }
            }));
        }
    }

    Json(json!(GeminiModelsResponse { models }))
}
