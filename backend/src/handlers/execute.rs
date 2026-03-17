// ---------------------------------------------------------------------------
// handlers/execute.rs — Legacy HTTP execute + internal tool bridge
// Delegation layer — delegates to jaskier_core::handlers::execute
// ---------------------------------------------------------------------------

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde_json::Value;

use jaskier_core::error::ApiError;
use crate::models::{ExecuteRequest, ExecuteResponse};
use crate::state::AppState;

// ---------------------------------------------------------------------------
// ADK Internal Tool Bridge
// ---------------------------------------------------------------------------

/// POST /api/internal/tool — Internal tool execution bridge for ADK sidecar.
pub async fn internal_tool_execute(
    state: State<AppState>,
    body: Json<Value>,
) -> Result<Json<Value>, ApiError> {
    jaskier_core::handlers::execute::internal_tool_execute::<AppState>(state, body).await
}

// ---------------------------------------------------------------------------
// HTTP Execute (Legacy)
// ---------------------------------------------------------------------------

#[utoipa::path(post, path = "/api/execute", tag = "chat",
    request_body = ExecuteRequest,
    responses((status = 200, description = "Execution result", body = ExecuteResponse))
)]
pub async fn execute(
    state: State<AppState>,
    body: Json<ExecuteRequest>,
) -> (StatusCode, Json<Value>) {
    jaskier_core::handlers::execute::execute::<AppState>(state, body).await
}
