// Jaskier Shared Pattern -- mcp
//! MCP (Model Context Protocol) support — client + server.
//!
//! **Client** and **Config**: re-exported from `jaskier-core` shared crate.
//! **Server** (`mcp_handler`): app-specific, lives in `server.rs`.
//!
//! Protocol: JSON-RPC 2.0 over HTTP (lightweight, no stdio transport needed).
//! Spec: <https://spec.modelcontextprotocol.io/2024-11-05/>

pub mod client;
pub mod config;
pub mod server;

use crate::state::AppState;
use axum::{
    Router, middleware,
    routing::{get, patch, post},
};

pub fn mcp_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route(
            "/api/mcp/servers",
            get(config::mcp_server_list::<AppState>).post(config::mcp_server_create::<AppState>),
        )
        .route(
            "/api/mcp/servers/{id}",
            patch(config::mcp_server_update::<AppState>).delete(config::mcp_server_delete::<AppState>),
        )
        .route(
            "/api/mcp/servers/{id}/connect",
            post(config::mcp_server_connect::<AppState>),
        )
        .route(
            "/api/mcp/servers/{id}/disconnect",
            post(config::mcp_server_disconnect::<AppState>),
        )
        .route("/api/mcp/servers/{id}/tools", get(config::mcp_server_tools::<AppState>))
        .route("/api/mcp/tools", get(config::mcp_all_tools::<AppState>))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            jaskier_core::auth::require_auth::<AppState>,
        ))
}
