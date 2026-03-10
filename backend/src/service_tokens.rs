// Jaskier Shared Pattern — Service Token Management
// Generic encrypted token storage for services like Fly.io.
// Reuses encrypt_token/decrypt_token from oauth.rs.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::oauth::{decrypt_token, encrypt_token};
use crate::state::AppState;

// ── Validation helpers ─────────────────────────────────────────────────────

/// Maximum token size in bytes (10 KB).
const MAX_TOKEN_BYTES: usize = 10_240;

/// Check whether an encryption key is configured.
/// Mirrors the logic in `oauth::get_encryption_key()` without exposing the key.
fn is_encryption_configured() -> bool {
    std::env::var("OAUTH_ENCRYPTION_KEY")
        .ok()
        .or_else(|| std::env::var("AUTH_SECRET").ok())
        .filter(|s| !s.is_empty())
        .is_some()
}

/// Validate service name: alphanumeric, underscore, hyphen; 1-64 chars.
fn validate_service_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 64 {
        return Err("Service name must be 1-64 characters".into());
    }
    if !name.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-') {
        return Err("Service name must be alphanumeric, underscore, or hyphen".into());
    }
    Ok(())
}

// ── DB row ───────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct ServiceTokenRow {
    service: String,
    encrypted_token: String,
}

// ═══════════════════════════════════════════════════════════════════════
//  Handlers (PROTECTED — behind auth middleware)
// ═══════════════════════════════════════════════════════════════════════

/// GET /api/tokens — list all stored service tokens (names only, not values)
pub async fn list_tokens(State(state): State<AppState>) -> Json<Value> {
    let rows = sqlx::query_as::<_, ServiceTokenRow>(concat!(
        "SELECT service, encrypted_token FROM ",
        "gh_service_tokens"
    ))
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let services: Vec<Value> = rows
        .iter()
        .map(|r| {
            json!({
                "service": r.service,
                "configured": decrypt_token(&r.encrypted_token).is_ok(),
            })
        })
        .collect();

    Json(json!({ "tokens": services }))
}

#[derive(Deserialize)]
pub struct StoreTokenRequest {
    pub service: String,
    pub token: String,
}

/// POST /api/tokens — store or update a service token
pub async fn store_token(
    State(state): State<AppState>,
    Json(req): Json<StoreTokenRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if req.service.is_empty() || req.token.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "service and token are required" })),
        ));
    }

    // Bug fix #2: validate service name
    validate_service_name(&req.service).map_err(|e| {
        (StatusCode::BAD_REQUEST, Json(json!({ "error": e })))
    })?;

    // Bug fix #3: enforce token size limit (10 KB)
    if req.token.len() > MAX_TOKEN_BYTES {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": format!("Token too large ({} bytes, max {})", req.token.len(), MAX_TOKEN_BYTES) })),
        ));
    }

    // Bug fix #1: refuse to store tokens without encryption key
    if !is_encryption_configured() {
        tracing::warn!(
            "Attempted to store service token for '{}' but no encryption key is configured \
             (set OAUTH_ENCRYPTION_KEY or AUTH_SECRET)",
            req.service
        );
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "Encryption key not configured — cannot safely store tokens" })),
        ));
    }

    let encrypted = encrypt_token(&req.token);

    sqlx::query(concat!(
        "INSERT INTO ",
        "gh_service_tokens",
        " (service, encrypted_token, updated_at) ",
        "VALUES ($1, $2, NOW()) ",
        "ON CONFLICT (service) DO UPDATE SET ",
        "encrypted_token = $2, updated_at = NOW()"
    ))
    .bind(&req.service)
    .bind(&encrypted)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to store service token: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Failed to store authentication data" })),
        )
    })?;

    tracing::info!("Service token stored for: {}", req.service);

    Ok(Json(json!({
        "status": "ok",
        "service": req.service,
    })))
}

/// DELETE /api/tokens/{service} — delete a service token
pub async fn delete_token(
    State(state): State<AppState>,
    Path(service): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    // Bug fix #2: validate service name
    validate_service_name(&service).map_err(|e| {
        (StatusCode::BAD_REQUEST, Json(json!({ "error": e })))
    })?;

    sqlx::query(concat!(
        "DELETE FROM ",
        "gh_service_tokens",
        " WHERE service = $1"
    ))
    .bind(&service)
    .execute(&state.db)
    .await
    .ok();

    tracing::info!("Service token deleted for: {}", service);
    Ok(Json(json!({ "status": "ok" })))
}

// ═══════════════════════════════════════════════════════════════════════
//  Token access (used by tools)
// ═══════════════════════════════════════════════════════════════════════

/// Get a decrypted service token by service name.
pub async fn get_service_token(state: &AppState, service: &str) -> Option<String> {
    // Bug fix #2: validate service name
    if validate_service_name(service).is_err() {
        tracing::warn!(
            "get_service_token called with invalid service name: {:?}",
            service
        );
        return None;
    }

    let row = sqlx::query_as::<_, ServiceTokenRow>(concat!(
        "SELECT service, encrypted_token FROM ",
        "gh_service_tokens",
        " WHERE service = $1"
    ))
    .bind(service)
    .fetch_optional(&state.db)
    .await
    .ok()??;

    // Bug fix #1: warn when reading a plaintext token (backward compat — still returned)
    if !row.encrypted_token.starts_with("enc:") {
        tracing::warn!(
            "Service token for '{}' is stored in PLAINTEXT — set OAUTH_ENCRYPTION_KEY \
             or AUTH_SECRET and re-store the token to encrypt it",
            service
        );
    }

    decrypt_token(&row.encrypted_token).ok()
}
