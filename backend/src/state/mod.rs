// Jaskier Shared Pattern — state
// GeminiHydra v15 - Application state
//
// Uses BaseHydraState from jaskier-hydra-state shared crate for all common
// fields, constructor, and mechanical trait implementations.
//
// B306-T5: Decomposed into sub-modules for focused responsibility:
//   - `session_state`  — agent session management and A2A task orchestration
//   - `model_state`    — AI model configuration, API integration, MCP server surface
// This file retains: AppState struct, constructor, health/auth/infra trait impls.

pub mod model_state;
pub mod session_state;

use std::collections::HashMap;
use std::ops::Deref;
use std::sync::Arc;
use std::time::Instant;

use tokio::sync::RwLock;

use jaskier_hydra_state::{BaseHydraConfig, BaseHydraState};

// ── Re-exports for backward compatibility ───────────────────────────────────
// Existing code (main.rs, handlers, streaming.rs, etc.) imports these from crate::state.
pub use jaskier_hydra_state::{
    CircuitBreaker, LogEntry, LogRingBuffer, ModelCache, OAUTH_STATE_TTL, OAuthPkceState,
    RuntimeState, SystemSnapshot,
};

// ── AppState ────────────────────────────────────────────────────────────────
#[derive(Clone)]
pub struct AppState {
    pub base: BaseHydraState,
    /// Shared auth state for jaskier-auth integration (B13 Unified Auth).
    pub auth: Arc<jaskier_auth::AuthState>,
}

impl Deref for AppState {
    type Target = BaseHydraState;
    fn deref(&self) -> &BaseHydraState {
        &self.base
    }
}

// ── Constructor ─────────────────────────────────────────────────────────────

impl AppState {
    pub async fn new(db: sqlx::PgPool, log_buffer: Arc<LogRingBuffer>) -> Self {
        let db_for_auth = db.clone();
        let base = BaseHydraState::new(
            db,
            log_buffer,
            BaseHydraConfig {
                app_name: "GeminiHydra",
                google_auth_table: "gh_google_auth",
                agents_table: "gh_agents",
                circuit_provider: "gemini",
                // B13: credentials resolved from env vars (Vault sets these).
                api_key_env_vars: &["GOOGLE_API_KEY", "GEMINI_API_KEY"],
                mcp_servers_table: "gh_mcp_servers",
                mcp_tools_table: "gh_mcp_discovered_tools",
            },
        )
        .await;

        let auth_config = jaskier_auth::AuthConfig::from_env();
        let auth = jaskier_auth::AuthState::new(db_for_auth, auth_config);

        Self { base, auth }
    }

    pub fn is_ready(&self) -> bool {
        self.base.is_ready()
    }
    pub fn mark_ready(&self) {
        self.base.mark_ready();
    }

    pub async fn refresh_agents(&self) {
        self.base.refresh_agents("gh_agents").await;
    }
}

// ── Mechanical trait delegations (identical across all Quad apps) ────────────
jaskier_hydra_state::delegate_base_traits!(AppState, "8081", "gh");

// ── App-specific trait implementations ──────────────────────────────────────

impl jaskier_core::handlers::system::HasHealthState for AppState {
    fn version(&self) -> &'static str {
        "15.0.0"
    }
    fn app_name(&self) -> &'static str {
        "GeminiHydra"
    }
    fn start_time(&self) -> Instant {
        self.base.start_time
    }
    fn is_ready(&self) -> bool {
        self.base.is_ready()
    }
    fn has_auth_secret(&self) -> bool {
        self.base.auth_secret.is_some()
    }

    fn api_keys_snapshot(&self) -> HashMap<String, String> {
        self.base
            .api_keys
            .try_read()
            .map(|g| g.clone())
            .unwrap_or_default()
    }

    fn google_models_snapshot(&self) -> Vec<jaskier_core::model_registry::ModelInfo> {
        self.base
            .model_cache
            .try_read()
            .map(|c| c.models.get("google").cloned().unwrap_or_default())
            .unwrap_or_default()
    }

    fn system_stats_snapshot(&self) -> jaskier_core::handlers::system::SystemStatsSnapshot {
        let snap = self.base.system_monitor.try_read();
        match snap {
            Ok(s) => jaskier_core::handlers::system::SystemStatsSnapshot {
                cpu_usage_percent: s.cpu_usage_percent,
                memory_used_mb: s.memory_used_mb,
                memory_total_mb: s.memory_total_mb,
                platform: s.platform.clone(),
            },
            Err(_) => jaskier_core::handlers::system::SystemStatsSnapshot {
                cpu_usage_percent: 0.0,
                memory_used_mb: 0.0,
                memory_total_mb: 0.0,
                platform: std::env::consts::OS.to_string(),
            },
        }
    }

    async fn browser_proxy_json(&self) -> Option<serde_json::Value> {
        if !jaskier_browser::browser_proxy::is_enabled() {
            return None;
        }
        let status = self.base.browser_proxy_status.read().await.clone();
        serde_json::to_value(status).ok()
    }

    fn browser_proxy_history_snapshot(&self, limit: usize) -> (Vec<serde_json::Value>, usize) {
        let events = self.base.browser_proxy_history.recent(limit);
        let total = self.base.browser_proxy_history.len();
        let json_events = events
            .into_iter()
            .filter_map(|e| serde_json::to_value(e).ok())
            .collect();
        (json_events, total)
    }
}

impl jaskier_core::handlers::system::HasApiKeyRotation for AppState {
    fn api_keys_lock(&self) -> &Arc<RwLock<HashMap<String, String>>> {
        &self.base.api_keys
    }
}

// HasSessionsState — generated by delegate_base_traits! macro above

// ── HasAuthState — jaskier-auth integration ──────────────────────────────

impl jaskier_auth::HasAuthState for AppState {
    fn auth_state(&self) -> &jaskier_auth::AuthState {
        &self.auth
    }

    fn jwt_secret(&self) -> &[u8] {
        self.base
            .auth_secret
            .as_deref()
            .unwrap_or("geminihydra-default-dev-secret-change-me")
            .as_bytes()
    }

    fn db(&self) -> &sqlx::PgPool {
        &self.base.db
    }

    fn google_client_id(&self) -> &str {
        self.auth
            .config
            .google_oauth_client_id
            .as_deref()
            .unwrap_or("")
    }

    fn app_id(&self) -> &str {
        "geminihydra"
    }
}
