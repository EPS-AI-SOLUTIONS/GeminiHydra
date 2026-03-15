// ---------------------------------------------------------------------------
// handlers/ â€” HTTP request handlers
// Sub-modules for logical grouping; mod.rs re-exports all public items
// so that `crate::handlers::*` paths remain unchanged.
// ---------------------------------------------------------------------------

use jaskier_core::auth;
use crate::state::AppState;
use axum::{
    Router, middleware,
    routing::{get, post},
};

pub(crate) mod agents;
pub(crate) mod execute;
pub(crate) mod files_handlers;
pub(crate) mod streaming;
pub(crate) mod system;
#[cfg(test)]
mod tests;

// â”€â”€ Router Factories â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub fn agents_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route(
            "/api/agents",
            get(agents::list_agents::<AppState>).post(agents::create_agent::<AppState>),
        )
        .route(
            "/api/agents/profiles",
            get(agents::list_profiles::<AppState>).post(agents::create_profile::<AppState>),
        )
        .route("/api/agents/classify", post(agents::classify_agent::<AppState>))
        .route("/api/agents/delegations", get(agents::list_delegations::<AppState>))
        .route(
            "/api/agents/delegations/stream",
            get(agents::stream_delegations::<AppState>),
        )
        .route(
            "/api/agents/{id}",
            post(agents::update_agent::<AppState>).delete(agents::delete_agent::<AppState>),
        )
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            jaskier_core::auth::require_auth::<AppState>,
        ))
}

pub fn system_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/api/system/stats", get(system::system_stats))
        .route("/api/system/audit", get(system::system_audit))
        .route("/api/admin/rotate-key", post(system::rotate_key))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            jaskier_core::auth::require_auth::<AppState>,
        ))
}

pub fn files_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/api/files/read", post(files_handlers::read_file))
        .route("/api/files/list", post(files_handlers::list_files))
        .route("/api/files/browse", post(files_handlers::browse_directory))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            jaskier_core::auth::require_auth::<AppState>,
        ))
}

// â”€â”€ Re-exports (backward-compatible) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub use agents::{
    classify_agent, create_agent, create_profile, delete_agent, list_agents, list_profiles,
    update_agent,
};
pub use execute::{execute, internal_tool_execute};
pub use files_handlers::{browse_directory, list_files, read_file};
pub use streaming::ws_execute;
pub use system::{
    ProxyHistoryResponse, auth_mode, browser_proxy_history, gemini_models, health, health_detailed,
    readiness, rotate_key, system_audit, system_stats,
};

// ── utoipa __path_* re-exports ──────────────────────────────────────────────
// NOTE: agent handler __path_* items are not re-exported here because the
// generic handlers in jaskier-core are not compatible with utoipa macros.
// Agent endpoints are removed from #[openapi(paths(...))] in lib.rs.
pub use execute::__path_execute;
pub use files_handlers::{__path_list_files, __path_read_file};
pub use system::{
    __path_auth_mode, __path_browser_proxy_history, __path_gemini_models, __path_health,
    __path_health_detailed, __path_readiness, __path_system_stats,
};

pub use jaskier_core::error::{ApiError, ApiErrorWithDetails, StructuredApiError};
