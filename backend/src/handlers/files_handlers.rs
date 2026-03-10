// ---------------------------------------------------------------------------
// handlers/files_handlers.rs — File read, list, and native folder dialog
// ---------------------------------------------------------------------------

use axum::Json;
use serde_json::{Value, json};

use crate::files;
use crate::models::{
    FileEntryResponse, FileListRequest, FileListResponse, FileReadRequest, FileReadResponse,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Sanitize a FileError reason for HTTP responses — strip OS-level error details
/// to prevent information disclosure. The full error is logged server-side.
fn sanitize_file_error(e: &files::FileError) -> String {
    let reason = &e.reason;
    // These prefixes contain an OS error suffix after ": " — strip it
    for prefix in &[
        "Cannot access file",
        "Cannot open file",
        "Cannot read file",
        "Cannot read directory",
        "Cannot read metadata",
        "Cannot create parent directory",
        "Cannot write file",
        "Error reading entry",
    ] {
        if reason.starts_with(prefix) {
            tracing::warn!("file operation failed for '{}': {}", e.path, reason);
            return prefix.to_string();
        }
    }
    // Safe reasons (no OS error details) pass through as-is
    reason.clone()
}

// ---------------------------------------------------------------------------
// File Handlers
// ---------------------------------------------------------------------------

#[utoipa::path(post, path = "/api/files/read", tag = "files",
    request_body = FileReadRequest,
    responses((status = 200, description = "File content", body = FileReadResponse))
)]
pub async fn read_file(Json(body): Json<FileReadRequest>) -> Json<Value> {
    match files::read_file_raw(&body.path).await {
        Ok(f) => Json(json!(FileReadResponse {
            path: f.path,
            content: f.content,
            size_bytes: f.size_bytes,
            truncated: f.truncated,
            extension: f.extension
        })),
        Err(e) => Json(json!({ "error": sanitize_file_error(&e), "path": e.path })),
    }
}

#[utoipa::path(post, path = "/api/files/list", tag = "files",
    request_body = FileListRequest,
    responses((status = 200, description = "Directory listing", body = FileListResponse))
)]
pub async fn list_files(Json(body): Json<FileListRequest>) -> Json<Value> {
    match files::list_directory(&body.path, body.show_hidden).await {
        Ok(e) => {
            let res: Vec<_> = e
                .into_iter()
                .map(|i| FileEntryResponse {
                    name: i.name,
                    path: i.path,
                    is_dir: i.is_dir,
                    size_bytes: i.size_bytes,
                    extension: i.extension,
                })
                .collect();
            Json(json!(FileListResponse {
                path: body.path,
                count: res.len(),
                entries: res
            }))
        }
        Err(e) => Json(json!({ "error": sanitize_file_error(&e), "path": e.path })),
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  Native folder dialog — Jaskier Shared Pattern
// ═══════════════════════════════════════════════════════════════════════

/// Opens a native folder picker dialog (Windows only via `rfd`).
/// Returns the selected path or `{ "cancelled": true }` if user closed the dialog.
/// On non-Windows platforms returns an error (headless server — no GUI).
pub async fn browse_directory(Json(body): Json<Value>) -> Json<Value> {
    #[cfg(windows)]
    {
        let initial = body
            .get("initial_path")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_default();

        let result = tokio::task::spawn_blocking(move || {
            let mut dialog = rfd::FileDialog::new().set_title("Select Working Directory");
            if !initial.is_empty() && std::path::Path::new(&initial).is_dir() {
                dialog = dialog.set_directory(&initial);
            }
            dialog.pick_folder()
        })
        .await
        .unwrap_or(None);

        match result {
            Some(path) => Json(json!({ "path": path.to_string_lossy() })),
            None => Json(json!({ "cancelled": true })),
        }
    }

    #[cfg(not(windows))]
    {
        let _ = body;
        Json(json!({ "error": "Native folder dialog is only available on Windows" }))
    }
}
