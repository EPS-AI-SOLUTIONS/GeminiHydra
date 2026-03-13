#![recursion_limit = "512"]

pub mod a2a;
pub mod analysis;
pub mod audit;
pub mod auth;
pub mod browser_proxy;
pub mod classify;
pub mod context;
pub mod error;
pub mod files;
pub mod handlers;
pub mod logs;
pub mod mcp;
pub mod model_registry;
pub mod models;
pub mod oauth;
pub mod oauth_github;
pub mod oauth_google;
pub mod oauth_vercel;
pub mod ocr;
pub mod prompt;
pub mod service_tokens;
pub mod sessions;
pub mod state;
pub mod system_monitor;
pub mod tool_defs;
pub mod tools;
pub mod watchdog;

use axum::Router;
use axum::extract::State;
use axum::http::HeaderValue;
use axum::routing::{delete, get, post};
use utoipa::OpenApi;

use state::AppState;

// ---------------------------------------------------------------------------
// Jaskier Shared Pattern -- request_id middleware
// ---------------------------------------------------------------------------

/// Middleware that assigns a UUID correlation ID to every request.
/// - Adds the ID to the current tracing span for structured logging.
/// - Returns it as `X-Request-Id` response header for client-side correlation.
pub async fn request_id_middleware(
    request: axum::http::Request<axum::body::Body>,
    next: axum::middleware::Next,
) -> axum::response::Response {
    let request_id = uuid::Uuid::new_v4().to_string();

    // Record in the current tracing span so all log lines include it.
    tracing::Span::current().record("request_id", tracing::field::display(&request_id));
    tracing::debug!(request_id = %request_id, "assigned correlation ID");

    let mut response = next.run(request).await;

    // Attach as response header -- infallible for valid UUID strings.
    if let Ok(val) = HeaderValue::from_str(&request_id) {
        response.headers_mut().insert("x-request-id", val);
    }

    response
}

// -- OpenAPI documentation ----------------------------------------------------

#[derive(OpenApi)]
#[openapi(
    info(
        title = "GeminiHydra v15 API",
        version = "15.0.0",
        description = "Multi-Agent AI Swarm -- Backend API",
        license(name = "MIT")
    ),
    paths(
        // Health
        handlers::health,
        handlers::readiness,
        handlers::health_detailed,
        handlers::auth_mode,
        handlers::system_stats,
        handlers::browser_proxy_history,
        // Execute / Chat
        handlers::execute,
        handlers::gemini_models,
        // Files
        handlers::read_file,
        handlers::list_files,
        // Model registry
        model_registry::list_models,
        model_registry::refresh_models,
        model_registry::pin_model,
        model_registry::unpin_model,
        model_registry::list_pins,
        // Sessions
        sessions::list_sessions,
        sessions::create_session,
        sessions::get_session,
        sessions::update_session,
        sessions::delete_session,
        sessions::get_session_messages,
        sessions::add_session_message,
        sessions::generate_session_title,
        // History
        sessions::get_history,
        sessions::search_history,
        sessions::add_message,
        sessions::clear_history,
        // Settings
        sessions::get_settings,
        sessions::update_settings,
        sessions::reset_settings,
        // Memory
        sessions::list_memories,
        sessions::add_memory,
        sessions::clear_memories,
        sessions::get_knowledge_graph,
        sessions::add_knowledge_node,
        sessions::add_graph_edge,
        // Prompt history
        sessions::list_prompt_history,
        sessions::add_prompt_history,
        sessions::clear_prompt_history,
    ),
    components(schemas(
        // Core models
        models::HealthResponse,
        models::DetailedHealthResponse,
        models::ProviderInfo,
        models::SystemStats,
        // Agents
        models::WitcherAgent,
        models::ClassifyRequest,
        models::ClassifyResponse,
        models::CreateAgentProfile,
        models::AgentProfile,
        // Execute
        models::ExecuteRequest,
        models::ExecuteResponse,
        models::ExecutePlan,
        // Gemini
        models::GeminiModelsResponse,
        models::GeminiModelInfo,
        models::GeminiStreamRequest,
        // Settings
        models::AppSettings,
        // Chat
        models::ChatMessage,
        // Files
        models::FileReadRequest,
        models::FileReadResponse,
        models::FileListRequest,
        models::FileListResponse,
        models::FileEntryResponse,
        // Sessions
        models::Session,
        models::SessionSummary,
        models::CreateSessionRequest,
        models::UpdateSessionRequest,
        // Model registry
        model_registry::ModelInfo,
        model_registry::ResolvedModels,
        model_registry::PinModelRequest,
        // Prompt history
        models::AddPromptRequest,
        // Browser proxy
        browser_proxy::BrowserProxyStatus,
        browser_proxy::ProxyHealthEvent,
        handlers::ProxyHistoryResponse,
    )),
    tags(
        (name = "health", description = "Health & readiness endpoints"),
        (name = "auth", description = "Authentication & API key management"),
        (name = "agents", description = "Witcher agent CRUD & classification"),
        (name = "chat", description = "Execute prompts & streaming"),
        (name = "models", description = "Dynamic model registry & pinning"),
        (name = "files", description = "Local filesystem access"),
        (name = "sessions", description = "Chat session management"),
        (name = "history", description = "Chat history"),
        (name = "settings", description = "Application settings"),
        (name = "memory", description = "Agent memory & knowledge graph"),
        (name = "system", description = "System monitoring"),
    )
)]
pub struct ApiDoc;

// ---------------------------------------------------------------------------
// Router construction -- delegates to jaskier-core shared builder
// ---------------------------------------------------------------------------

/// Build the application router with the given state.
pub fn create_router(state: AppState) -> Router {
    jaskier_core::router_builder::build_hydra_router(state.clone(), build_config(state))
}

/// Build router without rate-limiting layers (for integration tests).
pub fn create_test_router(state: AppState) -> Router {
    jaskier_core::router_builder::build_hydra_test_router(state.clone(), build_config(state))
}

/// Construct the app-specific `HydraRouterConfig` with local handler fragments.
fn build_config(state: AppState) -> jaskier_core::router_builder::HydraRouterConfig<AppState> {
    jaskier_core::router_builder::HydraRouterConfig {
        // WebSocket streaming (Gemini-native)
        ws_route: Router::new()
            .route("/ws/execute", get(handlers::ws_execute::<AppState>)),

        // Execute endpoints
        execute_routes: Router::new()
            .route("/api/execute", post(handlers::execute))
            .route(
                "/api/v1/swarm/stream",
                get(handlers::streaming::swarm_sse_handler::<AppState>),
            ),

        // Sub-routers (already have auth middleware)
        agents_router: handlers::agents_router(state.clone()),
        files_router: handlers::files_router(state.clone()),
        system_router: handlers::system_router(state.clone()),

        // Browser proxy routes (from jaskier-browser, circular dep prevention)
        browser_proxy_routes: Router::new()
            .route(
                "/api/browser-proxy/status",
                get(browser_proxy::proxy_status::<AppState>),
            )
            .route(
                "/api/browser-proxy/login",
                post(browser_proxy::proxy_login::<AppState>),
            )
            .route(
                "/api/browser-proxy/login/status",
                get(browser_proxy::proxy_login_status::<AppState>),
            )
            .route(
                "/api/browser-proxy/reinit",
                post(browser_proxy::proxy_reinit::<AppState>),
            )
            .route(
                "/api/browser-proxy/logout",
                delete(browser_proxy::proxy_logout::<AppState>),
            ),

        // OCR routes (from jaskier-tools, circular dep prevention)
        ocr_routes: Router::new()
            .route("/api/ocr", post(ocr::ocr::<AppState>))
            .route("/api/ocr/stream", post(ocr::ocr_stream::<AppState>))
            .route("/api/ocr/batch/stream", post(ocr::ocr_batch_stream::<AppState>))
            .route("/api/ocr/history", get(ocr::ocr_history::<AppState>))
            .route(
                "/api/ocr/history/{id}",
                get(ocr::ocr_history_item::<AppState>)
                    .delete(ocr::ocr_history_delete::<AppState>),
            ),

        // App-specific protected routes
        app_protected_routes: Router::new()
            .route("/api/gemini/models", get(handlers::gemini_models)),

        // ADK sidecar internal tool bridge
        internal_tool_route: Router::new()
            .route("/api/internal/tool", post(handlers::internal_tool_execute)),

        // Prometheus metrics
        metrics_router: Router::new()
            .route("/api/metrics", get(metrics_handler)),

        // OpenAPI spec
        openapi: ApiDoc::openapi(),
    }
}

// -- Prometheus-compatible metrics endpoint -----------------------------------

/// Sanitize a string for use as a Prometheus label value.
fn sanitize_prom_label(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-' || *c == '.')
        .take(64)
        .collect()
}

async fn metrics_handler(State(state): State<AppState>) -> String {
    let snapshot = state.system_monitor.read().await;
    let uptime = state.start_time.elapsed().as_secs();

    // A2A delegation metrics
    let a2a_stats: Option<(i64, i64, i64, Option<f64>)> = sqlx::query_as(
        "SELECT COUNT(*), \
         COUNT(*) FILTER (WHERE status = 'completed'), \
         COUNT(*) FILTER (WHERE error_message IS NOT NULL), \
         AVG(duration_ms)::float8 \
         FROM gh_a2a_tasks",
    )
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();

    let (a2a_total, a2a_completed, a2a_errors, a2a_avg_ms) = a2a_stats.unwrap_or((0, 0, 0, None));

    // Per-agent duration metrics
    let per_agent: Vec<(String, f64, i64)> = sqlx::query_as(
        "SELECT agent_id, AVG(duration_ms)::float8, COUNT(*) \
         FROM gh_a2a_tasks WHERE duration_ms IS NOT NULL \
         GROUP BY agent_id ORDER BY agent_id",
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let mut agent_lines = String::new();
    if !per_agent.is_empty() {
        agent_lines.push_str(
            "# HELP a2a_delegation_duration_by_agent Average delegation duration per agent in ms\n\
             # TYPE a2a_delegation_duration_by_agent gauge\n",
        );
        for (agent, avg_ms, count) in &per_agent {
            let safe_agent = sanitize_prom_label(agent);
            agent_lines.push_str(&format!(
                "a2a_delegation_duration_by_agent{{agent=\"{}\"}} {:.1}\n\
                 a2a_delegation_count_by_agent{{agent=\"{}\"}} {}\n",
                safe_agent, avg_ms, safe_agent, count
            ));
        }
    }

    format!(
        "# HELP cpu_usage_percent CPU usage percentage\n\
         # TYPE cpu_usage_percent gauge\n\
         cpu_usage_percent {:.1}\n\
         # HELP memory_used_bytes Memory used in bytes\n\
         # TYPE memory_used_bytes gauge\n\
         memory_used_bytes {}\n\
         # HELP memory_total_bytes Total memory in bytes\n\
         # TYPE memory_total_bytes gauge\n\
         memory_total_bytes {}\n\
         # HELP uptime_seconds Backend uptime in seconds\n\
         # TYPE uptime_seconds counter\n\
         uptime_seconds {}\n\
         # HELP a2a_delegations_total Total A2A delegations\n\
         # TYPE a2a_delegations_total counter\n\
         a2a_delegations_total {}\n\
         # HELP a2a_delegations_completed Completed A2A delegations\n\
         # TYPE a2a_delegations_completed counter\n\
         a2a_delegations_completed {}\n\
         # HELP a2a_delegations_errors Failed A2A delegations\n\
         # TYPE a2a_delegations_errors counter\n\
         a2a_delegations_errors {}\n\
         # HELP a2a_delegation_duration_avg_ms Average delegation duration in ms\n\
         # TYPE a2a_delegation_duration_avg_ms gauge\n\
         a2a_delegation_duration_avg_ms {:.1}\n\
         {}",
        snapshot.cpu_usage_percent,
        (snapshot.memory_used_mb * 1024.0 * 1024.0) as u64,
        (snapshot.memory_total_mb * 1024.0 * 1024.0) as u64,
        uptime,
        a2a_total,
        a2a_completed,
        a2a_errors,
        a2a_avg_ms.unwrap_or(0.0),
        agent_lines,
    )
}
