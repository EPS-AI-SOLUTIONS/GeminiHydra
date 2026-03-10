// Jaskier Shared Pattern -- mcp/config
//! MCP server configuration: CRUD for gh_mcp_servers + gh_mcp_discovered_tools.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{FromRow, PgPool};

use crate::state::AppState;

// ── SSRF URL validation ──────────────────────────────────────────────────

/// Validate an MCP server URL to prevent SSRF attacks.
///
/// In production (AUTH_SECRET set): blocks localhost, private IPs, cloud metadata,
/// and Fly.io .internal addresses.
/// In dev mode (no AUTH_SECRET): only blocks cloud metadata and .internal addresses.
pub fn validate_mcp_url(url: &str, is_prod: bool) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|e| format!("Invalid MCP server URL: {}", e))?;

    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(format!("Only http/https schemes allowed, got: {}", scheme));
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| "MCP server URL has no host".to_string())?;

    let h = host.to_lowercase();

    // Always block: cloud metadata and Fly.io internal network
    if h == "metadata.google.internal" || h.ends_with(".internal") || h.contains("169.254.169.254")
    {
        return Err(format!(
            "Blocked: MCP URL points to internal/metadata host '{}'",
            host
        ));
    }

    // Block IP literals pointing to link-local (metadata) range — always
    if let Ok(ip) = host.parse::<std::net::IpAddr>()
        && let std::net::IpAddr::V4(v4) = ip
        && v4.octets()[0] == 169
        && v4.octets()[1] == 254
    {
        return Err(format!("Blocked: MCP URL points to link-local IP {}", ip));
    }

    // Production-only: also block localhost and private IPs
    if is_prod {
        if h == "localhost" || h.ends_with(".local") || h.ends_with(".localhost") {
            return Err(format!(
                "Blocked: MCP URL points to local host '{}' (production mode)",
                host
            ));
        }

        if let Ok(ip) = host.parse::<std::net::IpAddr>() {
            match ip {
                std::net::IpAddr::V4(v4) => {
                    if v4.is_loopback()
                        || v4.is_private()
                        || v4.is_link_local()
                        || v4.is_broadcast()
                        || v4.is_unspecified()
                    {
                        return Err(format!(
                            "Blocked: MCP URL points to private/local IP {} (production mode)",
                            ip
                        ));
                    }
                }
                std::net::IpAddr::V6(v6) => {
                    if v6.is_loopback() || v6.is_unspecified() {
                        return Err(format!(
                            "Blocked: MCP URL points to private IP {} (production mode)",
                            ip
                        ));
                    }
                    let seg = v6.segments();
                    // ULA (fc00::/7) and link-local (fe80::/10)
                    if (seg[0] & 0xfe00) == 0xfc00 || (seg[0] & 0xffc0) == 0xfe80 {
                        return Err(format!(
                            "Blocked: MCP URL points to private IP {} (production mode)",
                            ip
                        ));
                    }
                    // IPv4-mapped addresses (::ffff:x.x.x.x)
                    if let Some(v4) = v6.to_ipv4_mapped()
                        && (v4.is_loopback() || v4.is_private() || v4.is_link_local())
                    {
                        return Err(format!(
                            "Blocked: MCP URL resolves to private IPv4-mapped IP {} (production mode)",
                            ip
                        ));
                    }
                }
            }
        }
    }

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct McpServerConfig {
    pub id: String,
    pub name: String,
    pub transport: String,
    pub command: Option<String>,
    pub args: String,
    pub env_vars: String,
    pub url: Option<String>,
    pub enabled: bool,
    pub auth_token: Option<String>,
    pub timeout_secs: i32,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct McpDiscoveredTool {
    pub id: String,
    pub server_id: String,
    pub tool_name: String,
    pub description: Option<String>,
    pub input_schema: String,
    pub discovered_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateMcpServer {
    pub name: String,
    pub transport: String,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub env_vars: Option<Value>,
    pub url: Option<String>,
    pub enabled: Option<bool>,
    pub auth_token: Option<String>,
    pub timeout_secs: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMcpServer {
    pub name: Option<String>,
    pub transport: Option<String>,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub env_vars: Option<Value>,
    pub url: Option<String>,
    pub enabled: Option<bool>,
    pub auth_token: Option<String>,
    pub timeout_secs: Option<i32>,
}

// ── DB functions ──────────────────────────────────────────────────────────

pub async fn list_mcp_servers(db: &PgPool) -> Result<Vec<McpServerConfig>, sqlx::Error> {
    sqlx::query_as::<_, McpServerConfig>("SELECT * FROM gh_mcp_servers ORDER BY created_at ASC")
        .fetch_all(db)
        .await
}

pub async fn get_mcp_server(db: &PgPool, id: &str) -> Result<Option<McpServerConfig>, sqlx::Error> {
    sqlx::query_as::<_, McpServerConfig>("SELECT * FROM gh_mcp_servers WHERE id = $1")
        .bind(id)
        .fetch_optional(db)
        .await
}

pub async fn create_mcp_server_db(
    db: &PgPool,
    req: &CreateMcpServer,
) -> Result<McpServerConfig, sqlx::Error> {
    let args_json = serde_json::to_string(&req.args.as_deref().unwrap_or(&[]))
        .unwrap_or_else(|_| "[]".to_string());
    let env_json = req
        .env_vars
        .as_ref()
        .map(|v| v.to_string())
        .unwrap_or_else(|| "{}".to_string());

    sqlx::query_as::<_, McpServerConfig>(
        "INSERT INTO gh_mcp_servers (name, transport, command, args, env_vars, url, enabled, auth_token, timeout_secs) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *",
    )
    .bind(&req.name)
    .bind(&req.transport)
    .bind(&req.command)
    .bind(&args_json)
    .bind(&env_json)
    .bind(&req.url)
    .bind(req.enabled.unwrap_or(true))
    .bind(&req.auth_token)
    .bind(req.timeout_secs.unwrap_or(30))
    .fetch_one(db)
    .await
}

pub async fn update_mcp_server_db(
    db: &PgPool,
    id: &str,
    req: &UpdateMcpServer,
) -> Result<Option<McpServerConfig>, sqlx::Error> {
    let current = match get_mcp_server(db, id).await? {
        Some(c) => c,
        None => return Ok(None),
    };
    let name = req.name.as_deref().unwrap_or(&current.name);
    let transport = req.transport.as_deref().unwrap_or(&current.transport);
    let command = req.command.as_deref().or(current.command.as_deref());
    let args = req
        .args
        .as_ref()
        .map(|a| serde_json::to_string(a).unwrap_or_else(|_| "[]".to_string()))
        .unwrap_or(current.args.clone());
    let env_vars = req
        .env_vars
        .as_ref()
        .map(|v| v.to_string())
        .unwrap_or(current.env_vars.clone());
    let url = req.url.as_deref().or(current.url.as_deref());
    let enabled = req.enabled.unwrap_or(current.enabled);
    let auth_token = req.auth_token.as_deref().or(current.auth_token.as_deref());
    let timeout_secs = req.timeout_secs.unwrap_or(current.timeout_secs);

    sqlx::query_as::<_, McpServerConfig>(
        "UPDATE gh_mcp_servers SET name=$1, transport=$2, command=$3, args=$4, env_vars=$5, url=$6, enabled=$7, auth_token=$8, timeout_secs=$9, updated_at=NOW() WHERE id=$10 RETURNING *",
    )
    .bind(name).bind(transport).bind(command).bind(&args).bind(&env_vars)
    .bind(url).bind(enabled).bind(auth_token).bind(timeout_secs).bind(id)
    .fetch_optional(db)
    .await
}

pub async fn delete_mcp_server_db(db: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM gh_mcp_servers WHERE id = $1")
        .bind(id)
        .execute(db)
        .await?;
    Ok(result.rows_affected() > 0)
}

/// Save discovered tools for a server (replace all).
/// Each tuple is (tool_name, description, input_schema_json).
pub async fn save_discovered_tools(
    db: &PgPool,
    server_id: &str,
    tools: &[(String, Option<String>, String)],
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM gh_mcp_discovered_tools WHERE server_id = $1")
        .bind(server_id)
        .execute(db)
        .await?;

    if tools.is_empty() {
        return Ok(());
    }

    let mut names = Vec::with_capacity(tools.len());
    let mut descs = Vec::with_capacity(tools.len());
    let mut schemas = Vec::with_capacity(tools.len());

    for (name, desc, schema) in tools {
        names.push(name.clone());
        descs.push(desc.clone());
        schemas.push(schema.clone());
    }

    sqlx::query(
        "INSERT INTO gh_mcp_discovered_tools (server_id, tool_name, description, input_schema) 
         SELECT $1, * FROM UNNEST($2::text[], $3::text[], $4::text[])",
    )
    .bind(server_id)
    .bind(&names)
    .bind(&descs)
    .bind(&schemas)
    .execute(db)
    .await?;

    Ok(())
}

pub async fn list_discovered_tools(
    db: &PgPool,
    server_id: &str,
) -> Result<Vec<McpDiscoveredTool>, sqlx::Error> {
    sqlx::query_as::<_, McpDiscoveredTool>(
        "SELECT * FROM gh_mcp_discovered_tools WHERE server_id = $1 ORDER BY tool_name ASC",
    )
    .bind(server_id)
    .fetch_all(db)
    .await
}

pub async fn list_all_discovered_tools(db: &PgPool) -> Result<Vec<McpDiscoveredTool>, sqlx::Error> {
    sqlx::query_as::<_, McpDiscoveredTool>(
        "SELECT * FROM gh_mcp_discovered_tools ORDER BY server_id, tool_name ASC",
    )
    .fetch_all(db)
    .await
}

// ── Security: stdio command allowlist ──────────────────────────────────────

/// Allowed base commands for MCP stdio transport.
/// Only well-known package runners and interpreters are permitted.
const ALLOWED_STDIO_COMMANDS: &[&str] = &[
    "npx",
    "npx.cmd",
    "node",
    "node.exe",
    "python",
    "python.exe",
    "python3",
    "python3.exe",
    "uvx",
    "uvx.exe",
    "uv",
    "uv.exe",
    "deno",
    "deno.exe",
    "bun",
    "bun.exe",
];

/// Environment variables that must not be overridden by MCP server config.
const BLOCKED_ENV_VARS: &[&str] = &[
    "PATH",
    "Path",
    "PATHEXT",
    "LD_PRELOAD",
    "LD_LIBRARY_PATH",
    "DYLD_INSERT_LIBRARIES",
    "COMSPEC",
    "SHELL",
    "HOME",
    "USERPROFILE",
    "SYSTEMROOT",
];

/// Validate stdio transport config: command must be in allowlist,
/// env vars must not contain blocked keys.
fn validate_stdio_config(command: &str, env_vars: Option<&Value>) -> Result<(), String> {
    let base = std::path::Path::new(command)
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or(command);

    if !ALLOWED_STDIO_COMMANDS.contains(&base) {
        return Err(format!(
            "Command '{}' not in allowlist. Allowed: npx, node, python, python3, uvx, uv, deno, bun",
            command
        ));
    }

    if let Some(env_val) = env_vars
        && let Some(obj) = env_val.as_object()
    {
        for key in obj.keys() {
            if BLOCKED_ENV_VARS.contains(&key.as_str()) {
                return Err(format!(
                    "Environment variable '{}' is blocked for security reasons",
                    key
                ));
            }
        }
    }

    Ok(())
}

// ── Helpers ────────────────────────────────────────────────────────────────

/// Redact auth_token and env_vars from server config for API responses.
fn redact_server(s: &McpServerConfig) -> Value {
    json!({
        "id": s.id,
        "name": s.name,
        "transport": s.transport,
        "command": s.command,
        "args": serde_json::from_str::<Value>(&s.args).unwrap_or(json!([])),
        "url": s.url,
        "enabled": s.enabled,
        "has_auth_token": s.auth_token.is_some(),
        "env_vars": null,
        "timeout_secs": s.timeout_secs,
        "created_at": s.created_at.to_rfc3339(),
        "updated_at": s.updated_at.to_rfc3339(),
    })
}

// ── HTTP Handlers ──────────────────────────────────────────────────────────

pub async fn mcp_server_list(State(state): State<AppState>) -> (StatusCode, Json<Value>) {
    match list_mcp_servers(&state.db).await {
        Ok(servers) => {
            let val: Vec<Value> = servers.iter().map(redact_server).collect();
            (StatusCode::OK, Json(json!({ "servers": val })))
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("DB error: {}", e) })),
        ),
    }
}

pub async fn mcp_server_create(
    State(state): State<AppState>,
    Json(body): Json<CreateMcpServer>,
) -> (StatusCode, Json<Value>) {
    if body.name.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Server name is required" })),
        );
    }
    if body.transport != "stdio" && body.transport != "http" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Transport must be stdio or http" })),
        );
    }
    if body.transport == "stdio"
        && let Some(ref cmd) = body.command
        && let Err(msg) = validate_stdio_config(cmd, body.env_vars.as_ref())
    {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": msg })));
    }
    // SSRF validation for HTTP transport URLs
    if body.transport == "http"
        && let Some(ref url) = body.url
    {
        let is_prod = state.auth_secret.is_some();
        if let Err(msg) = validate_mcp_url(url, is_prod) {
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": msg })));
        }
    }
    match create_mcp_server_db(&state.db, &body).await {
        Ok(server) => (StatusCode::CREATED, Json(redact_server(&server))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Failed to create: {}", e) })),
        ),
    }
}

pub async fn mcp_server_update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateMcpServer>,
) -> (StatusCode, Json<Value>) {
    // Validate stdio allowlist: check effective transport + command after merge
    if body.transport.as_deref() == Some("stdio")
        || body.command.is_some()
        || body.env_vars.is_some()
    {
        let current = match get_mcp_server(&state.db, &id).await {
            Ok(Some(c)) => c,
            Ok(None) => {
                return (
                    StatusCode::NOT_FOUND,
                    Json(json!({ "error": "MCP server not found" })),
                );
            }
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": format!("DB error: {}", e) })),
                );
            }
        };
        let effective_transport = body.transport.as_deref().unwrap_or(&current.transport);
        if effective_transport == "stdio" {
            let effective_command = body.command.as_deref().or(current.command.as_deref());
            let effective_env = body.env_vars.as_ref().or({
                // Parse current env_vars from DB JSON string for validation
                None
            });
            if let Some(cmd) = effective_command
                && let Err(msg) = validate_stdio_config(cmd, effective_env)
            {
                return (StatusCode::BAD_REQUEST, Json(json!({ "error": msg })));
            }
        }
    }
    // SSRF validation for HTTP transport URLs on update
    if let Some(ref url) = body.url {
        // Validate if transport is being set to http, or if URL is changing on an existing http server
        let needs_url_check = body.transport.as_deref() == Some("http")
            || (body.transport.is_none() && body.url.is_some());
        if needs_url_check {
            let is_prod = state.auth_secret.is_some();
            if let Err(msg) = validate_mcp_url(url, is_prod) {
                return (StatusCode::BAD_REQUEST, Json(json!({ "error": msg })));
            }
        }
    }
    match update_mcp_server_db(&state.db, &id, &body).await {
        Ok(Some(server)) => (StatusCode::OK, Json(redact_server(&server))),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "MCP server not found" })),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Failed to update: {}", e) })),
        ),
    }
}

pub async fn mcp_server_delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> (StatusCode, Json<Value>) {
    state.mcp_client.disconnect_server(&id).await;
    match delete_mcp_server_db(&state.db, &id).await {
        Ok(true) => (StatusCode::OK, Json(json!({ "deleted": true }))),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "MCP server not found" })),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Failed to delete: {}", e) })),
        ),
    }
}

pub async fn mcp_server_connect(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> (StatusCode, Json<Value>) {
    let server = match get_mcp_server(&state.db, &id).await {
        Ok(Some(s)) => s,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "MCP server not found" })),
            );
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("DB error: {}", e) })),
            );
        }
    };
    match state.mcp_client.connect_server(&server).await {
        Ok(()) => {
            let tools = state.mcp_client.get_server_tools(&id).await;
            (
                StatusCode::OK,
                Json(json!({
                    "connected": true,
                    "tools_discovered": tools.len(),
                    "tools": tools.iter().map(|t| json!({"name": t.name, "prefixed_name": t.prefixed_name, "description": t.description})).collect::<Vec<_>>()
                })),
            )
        }
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": format!("Failed to connect: {}", e) })),
        ),
    }
}

pub async fn mcp_server_disconnect(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> (StatusCode, Json<Value>) {
    state.mcp_client.disconnect_server(&id).await;
    (StatusCode::OK, Json(json!({ "disconnected": true })))
}

pub async fn mcp_server_tools(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> (StatusCode, Json<Value>) {
    let live_tools = state.mcp_client.get_server_tools(&id).await;
    if !live_tools.is_empty() {
        let tools_val: Vec<Value> = live_tools.iter().map(|t| json!({"name": t.name, "prefixed_name": t.prefixed_name, "description": t.description, "input_schema": t.input_schema, "source": "live"})).collect();
        return (
            StatusCode::OK,
            Json(json!({ "tools": tools_val, "source": "live" })),
        );
    }
    match list_discovered_tools(&state.db, &id).await {
        Ok(tools) => {
            let tools_val: Vec<Value> = tools.iter().map(|t| json!({"name": t.tool_name, "description": t.description, "input_schema": t.input_schema, "source": "db"})).collect();
            (
                StatusCode::OK,
                Json(json!({ "tools": tools_val, "source": "db" })),
            )
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Failed to list tools: {}", e) })),
        ),
    }
}

pub async fn mcp_all_tools(State(state): State<AppState>) -> (StatusCode, Json<Value>) {
    let tools = state.mcp_client.list_all_tools().await;
    let tools_val: Vec<Value> = tools.iter().map(|t| json!({"name": t.name, "prefixed_name": t.prefixed_name, "server_name": t.server_name, "server_id": t.server_id, "description": t.description, "input_schema": t.input_schema})).collect();
    (
        StatusCode::OK,
        Json(json!({ "tools": tools_val, "total": tools_val.len() })),
    )
}
