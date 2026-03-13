use axum::http::{HeaderValue, Method, header};
use tower_http::compression::CompressionLayer;
use tower_http::cors::CorsLayer;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::TraceLayer;

use gemini_hydra_backend::model_registry;
use gemini_hydra_backend::state::{AppState, LogRingBuffer};
use gemini_hydra_backend::watchdog;

use jaskier_core::app_builder;

async fn build_app(log_buffer: std::sync::Arc<LogRingBuffer>) -> (axum::Router, AppState) {
    dotenvy::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL required");
    let pool = jaskier_db::pool::create_pool(&database_url, jaskier_db::pool::PoolConfig::hydra())
        .await
        .expect("Failed to connect to Postgres");

    // Skip migrations if schema already exists (avoids checksum mismatch)
    if let Err(e) =
        jaskier_db::pool::run_migrations(&pool, sqlx::migrate!("./migrations")).await
    {
        tracing::warn!("Migration skipped (schema likely exists): {}", e);
    }

    let state = AppState::new(pool, log_buffer).await;

    // â”€â”€ Spawn system monitor (CPU/memory stats, refreshed every 5s) â”€â”€
    gemini_hydra_backend::system_monitor::spawn(state.system_monitor.clone());

    // CORS â€” explicit allowlist for Vite dev servers + Vercel production
    let cors = CorsLayer::new()
        .allow_origin([
            "http://localhost:5176".parse().expect("valid static CORS origin"),
            "http://127.0.0.1:5176".parse().expect("valid static CORS origin"),
            // ClaudeHydra frontend (partner app cross-session access)
            "http://localhost:5199".parse().expect("valid static CORS origin"),
            "http://127.0.0.1:5199".parse().expect("valid static CORS origin"),
            "https://geminihydra-v15.vercel.app".parse().expect("valid static CORS origin"),
        ])
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
        .max_age(std::time::Duration::from_secs(86_400));

    // Security headers
    let nosniff: SetResponseHeaderLayer<HeaderValue> = SetResponseHeaderLayer::overriding(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    let frame_deny: SetResponseHeaderLayer<HeaderValue> = SetResponseHeaderLayer::overriding(
        header::X_FRAME_OPTIONS,
        HeaderValue::from_static("DENY"),
    );
    let referrer: SetResponseHeaderLayer<HeaderValue> = SetResponseHeaderLayer::overriding(
        header::REFERRER_POLICY,
        HeaderValue::from_static("strict-origin-when-cross-origin"),
    );
    let csp: SetResponseHeaderLayer<HeaderValue> = SetResponseHeaderLayer::overriding(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://generativelanguage.googleapis.com https://api.anthropic.com https://api.openai.com; img-src 'self' data: blob:",
        ),
    );
    let hsts: SetResponseHeaderLayer<HeaderValue> = SetResponseHeaderLayer::overriding(
        header::STRICT_TRANSPORT_SECURITY,
        HeaderValue::from_static("max-age=63072000; includeSubDomains"),
    );
    let xss_protection: SetResponseHeaderLayer<HeaderValue> = SetResponseHeaderLayer::overriding(
        header::HeaderName::from_static("x-xss-protection"),
        HeaderValue::from_static("1; mode=block"),
    );
    let permissions_policy: SetResponseHeaderLayer<HeaderValue> =
        SetResponseHeaderLayer::overriding(
            header::HeaderName::from_static("permissions-policy"),
            HeaderValue::from_static("camera=(), microphone=(), geolocation=()"),
        );

    // Rate limiting is now per-endpoint inside create_router() â€” see lib.rs
    // WS: 10/min, /api/execute: 30/min, other: 120/min

    let app = gemini_hydra_backend::create_router(state.clone())
        .layer(RequestBodyLimitLayer::new(10 * 1024 * 1024))
        .layer(cors)
        .layer(nosniff)
        .layer(frame_deny)
        .layer(referrer)
        .layer(csp)
        .layer(hsts)
        .layer(xss_protection)
        .layer(permissions_policy)
        .layer(
            TraceLayer::new_for_http().make_span_with(|request: &axum::http::Request<_>| {
                // Log only path (not query string) to avoid leaking WS token (?token=xxx)
                tracing::info_span!(
                    "http_request",
                    method = %request.method(),
                    uri = %request.uri().path(),
                    request_id = tracing::field::Empty,
                )
            }),
        )
        // Correlation ID middleware â€” assigns UUID and returns X-Request-Id header
        .layer(axum::middleware::from_fn(
            gemini_hydra_backend::request_id_middleware,
        ))
        .layer(CompressionLayer::new());

    (app, state)
}

// â”€â”€ Shuttle deployment entry point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
#[cfg(feature = "shuttle")]
#[shuttle_runtime::main]
async fn main() -> shuttle_axum::ShuttleAxum {
    let log_buffer = std::sync::Arc::new(LogRingBuffer::new(1000));
    let (app, state) = build_app(log_buffer).await;
    model_registry::startup_sync(&state).await;
    state.mark_ready();
    Ok(app.into())
}

// â”€â”€ Local / Fly.io entry point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
#[cfg(not(feature = "shuttle"))]
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    app_builder::enable_ansi();
    let log_buffer = app_builder::init_tracing(1000);

    let (app, state) = build_app(log_buffer).await;

    // â”€â”€ Browser proxy mode logging â”€â”€
    if gemini_hydra_backend::browser_proxy::is_enabled() {
        let proxy_url = std::env::var("BROWSER_PROXY_URL")
            .unwrap_or_else(|_| "http://localhost:3001".to_string());
        let auto_restart = gemini_hydra_backend::browser_proxy::proxy_dir().is_some();
        tracing::info!(
            "BROWSER PROXY ENABLED â€” routing through {} (auto-restart: {})",
            proxy_url,
            if auto_restart {
                "ON"
            } else {
                "OFF â€” set BROWSER_PROXY_DIR to enable"
            }
        );
    }

    // â”€â”€ Non-blocking startup: model sync in background with retry â”€â”€
    let startup_state = state.clone();
    tokio::spawn(async move {
        // Retry up to 3 times with increasing delays: 5s, 15s, 30s
        const RETRY_DELAYS_SECS: &[u64] = &[5, 15, 30];
        const SYNC_TIMEOUT_PER_ATTEMPT: u64 = 90;

        let mut last_err = String::new();
        for (attempt, delay_secs) in RETRY_DELAYS_SECS.iter().enumerate() {
            let attempt_num = attempt + 1;
            tracing::info!(
                "startup: model registry sync attempt {}/{}",
                attempt_num,
                RETRY_DELAYS_SECS.len()
            );

            let timeout = std::time::Duration::from_secs(SYNC_TIMEOUT_PER_ATTEMPT);
            match tokio::time::timeout(timeout, model_registry::startup_sync(&startup_state)).await
            {
                Ok(()) => {
                    tracing::info!(
                        "startup: model registry sync complete (attempt {})",
                        attempt_num
                    );
                    startup_state.mark_ready();
                    return;
                }
                Err(_) => {
                    last_err = format!(
                        "timed out after {}s on attempt {}",
                        SYNC_TIMEOUT_PER_ATTEMPT, attempt_num
                    );
                    tracing::warn!(
                        "startup: model registry sync {} â€” retrying in {}s",
                        last_err,
                        delay_secs
                    );
                }
            }

            // Wait before next retry (unless this was the last attempt)
            if attempt_num < RETRY_DELAYS_SECS.len() {
                tokio::time::sleep(std::time::Duration::from_secs(*delay_secs)).await;
            }
        }

        tracing::error!(
            "startup: model registry sync failed after {} attempts ({}) â€” using fallback models",
            RETRY_DELAYS_SECS.len(),
            last_err
        );
        startup_state.mark_ready();
    });

    // â”€â”€ Spawn background watchdog â”€â”€
    let _watchdog = watchdog::spawn(state.clone());

    // â”€â”€ Spawn MCP client startup (connect to enabled MCP servers) â”€â”€
    let mcp_state = state.clone();
    tokio::spawn(async move {
        if let Err(e) = mcp_state.mcp_client.startup_connect().await {
            tracing::error!("MCP startup_connect failed: {}", e);
        }
    });

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "8081".to_string())
        .parse()?;
    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));

    app_builder::print_banner("GEMINIHYDRA v15", "Multi-Agent AI Swarm", "36", port);
    tracing::info!("GeminiHydra v15 backend listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(app_builder::shutdown_signal())
    .await?;

    Ok(())
}
