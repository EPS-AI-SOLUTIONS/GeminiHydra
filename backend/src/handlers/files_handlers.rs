// ---------------------------------------------------------------------------
// handlers/files_handlers.rs — Delegation layer
// Delegates to jaskier_tools::handlers::files_handlers shared implementation.
// Thin wrappers retain #[utoipa::path] for OpenAPI generation.
// ---------------------------------------------------------------------------

use axum::Json;
use serde_json::Value;

use crate::models::{FileListRequest, FileListResponse, FileReadRequest, FileReadResponse};

#[utoipa::path(post, path = "/api/files/read", tag = "files",
    request_body = FileReadRequest,
    responses((status = 200, description = "File content", body = FileReadResponse))
)]
pub async fn read_file(body: Json<FileReadRequest>) -> Json<Value> {
    jaskier_tools::handlers::files_handlers::read_file(body).await
}

#[utoipa::path(post, path = "/api/files/list", tag = "files",
    request_body = FileListRequest,
    responses((status = 200, description = "Directory listing", body = FileListResponse))
)]
pub async fn list_files(body: Json<FileListRequest>) -> Json<Value> {
    jaskier_tools::handlers::files_handlers::list_files(body).await
}

pub async fn browse_directory(body: Json<Value>) -> Json<Value> {
    jaskier_tools::handlers::files_handlers::browse_directory(body).await
}
