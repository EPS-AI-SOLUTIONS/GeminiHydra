// Jaskier Shared Pattern — model_registry
//
// GeminiHydra — Dynamic Model Registry
// All fetch/cache/select logic lives in jaskier-core::model_registry.
// This module re-exports shared types and provides thin AppState-typed
// wrappers for the HTTP handlers so lib.rs call-sites need no changes.

use axum::Json;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use serde_json::Value;

use crate::state::AppState;

// ── Re-export shared types from jaskier-core ──────────────────────────────────
pub use jaskier_core::model_registry::{
    ModelCache, ModelInfo, PinModelRequest, ResolvedModels, classify_complexity, get_model_id,
    refresh_cache, resolve_models, startup_sync,
};

// ── Concrete AppState-typed HTTP handlers ─────────────────────────────────────
//
// These wrappers simply delegate to the generic jaskier-core handlers, pinning
// `S = AppState`. This keeps the call-sites in lib.rs (including utoipa macros)
// unchanged.

/// GET /api/models — Return all cached models + resolved selections + pins
#[utoipa::path(get, path = "/api/models", tag = "models",
    responses((status = 200, description = "Cached models, resolved selections, and pins", body = Value))
)]
pub async fn list_models(State(state): State<AppState>) -> impl IntoResponse {
    jaskier_core::model_registry::list_models::<AppState>(State(state)).await
}

/// POST /api/models/refresh — Force refresh of model cache
#[utoipa::path(post, path = "/api/models/refresh", tag = "models",
    responses((status = 200, description = "Refreshed model cache", body = Value))
)]
pub async fn refresh_models(State(state): State<AppState>) -> Json<Value> {
    jaskier_core::model_registry::refresh_models::<AppState>(State(state)).await
}

/// POST /api/models/pin — Pin a specific model to a use case
#[utoipa::path(post, path = "/api/models/pin", tag = "models",
    request_body = PinModelRequest,
    responses((status = 200, description = "Model pinned", body = Value))
)]
pub async fn pin_model(
    State(state): State<AppState>,
    addr: axum::extract::ConnectInfo<std::net::SocketAddr>,
    body: Json<PinModelRequest>,
) -> Json<Value> {
    jaskier_core::model_registry::pin_model::<AppState>(State(state), addr, body).await
}

/// DELETE /api/models/pin/{use_case} — Unpin a use case
#[utoipa::path(delete, path = "/api/models/pin/{use_case}", tag = "models",
    params(("use_case" = String, Path, description = "Use case to unpin")),
    responses((status = 200, description = "Model unpinned", body = Value))
)]
pub async fn unpin_model(State(state): State<AppState>, use_case: Path<String>) -> Json<Value> {
    jaskier_core::model_registry::unpin_model::<AppState>(State(state), use_case).await
}

/// GET /api/models/pins — List all active pins
#[utoipa::path(get, path = "/api/models/pins", tag = "models",
    responses((status = 200, description = "All active model pins", body = Value))
)]
pub async fn list_pins(State(state): State<AppState>) -> Json<Value> {
    jaskier_core::model_registry::list_pins::<AppState>(State(state)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_cache_new_is_stale() {
        let cache = ModelCache::new();
        assert!(cache.is_stale());
    }

    #[test]
    fn model_cache_default_is_stale() {
        let cache = ModelCache::default();
        assert!(cache.is_stale());
    }

    #[test]
    fn model_cache_fresh_after_set() {
        let mut cache = ModelCache::new();
        cache.fetched_at = Some(std::time::Instant::now());
        assert!(!cache.is_stale());
    }

    #[test]
    fn model_cache_empty_models_by_default() {
        let cache = ModelCache::new();
        assert!(cache.models.is_empty());
    }
}
