// Jaskier Shared Pattern — state
// GeminiHydra v15 - Application state
//
// Uses BaseHydraState from jaskier-hydra-state shared crate for all common
// fields, constructor, and mechanical trait implementations.

use std::collections::HashMap;
use std::ops::Deref;
use std::sync::Arc;
use std::time::Instant;

use tokio::sync::RwLock;

use jaskier_hydra_state::{BaseHydraConfig, BaseHydraState};

// ── Re-exports for backward compatibility ───────────────────────────────────
// Existing code (main.rs, handlers, streaming.rs, etc.) imports these from crate::state.
pub use jaskier_hydra_state::{
    CircuitBreaker, LogEntry, LogRingBuffer, ModelCache, OAuthPkceState,
    RuntimeState, SystemSnapshot, OAUTH_STATE_TTL,
};

// ── AppState ────────────────────────────────────────────────────────────────
#[derive(Clone)]
pub struct AppState {
    pub base: BaseHydraState,
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
        let base = BaseHydraState::new(db, log_buffer, BaseHydraConfig {
            app_name: "GeminiHydra",
            google_auth_table: "gh_google_auth",
            agents_table: "gh_agents",
            circuit_provider: "gemini",
            // GeminiHydra uses Google OAuth (get_google_credential) — not env vars.
            api_key_env_vars: &[],
            mcp_servers_table: "gh_mcp_servers",
            mcp_tools_table: "gh_mcp_discovered_tools",
        }).await;
        Self { base }
    }

    pub fn is_ready(&self) -> bool { self.base.is_ready() }
    pub fn mark_ready(&self) { self.base.mark_ready(); }

    pub async fn refresh_agents(&self) {
        self.base.refresh_agents("gh_agents").await;
    }
}

// ── Mechanical trait delegations (identical across all Quad apps) ────────────
jaskier_hydra_state::delegate_base_traits!(AppState, "8081", "gh");

// ── HasExecutionContext — shared prepare_execution logic ─────────────────────

impl jaskier_core::context::HasExecutionContext for AppState {
    fn agents(&self) -> &Arc<RwLock<Vec<jaskier_core::models::WitcherAgent>>> {
        &self.base.agents
    }

    fn prompt_cache(&self) -> &Arc<RwLock<HashMap<String, String>>> {
        &self.base.prompt_cache
    }

    fn mcp_client(&self) -> &Arc<jaskier_core::mcp::client::McpClientManager> {
        &self.base.mcp_client
    }

    async fn resolve_api_credential(&self) -> (String, bool) {
        crate::oauth::get_google_credential(self)
            .await
            .unwrap_or_default()
    }

    fn extract_file_paths_from_prompt(&self, prompt: &str) -> Vec<String> {
        jaskier_tools::files::extract_file_paths(prompt)
    }

    async fn build_file_context_from_paths(&self, paths: &[String]) -> (String, usize) {
        let (ctx, errors) = jaskier_tools::files::build_file_context(paths).await;
        (ctx, errors.len())
    }
}

// ── App-specific trait implementations ──────────────────────────────────────

impl jaskier_core::handlers::system::HasHealthState for AppState {
    fn version(&self) -> &'static str { "15.0.0" }
    fn app_name(&self) -> &'static str { "GeminiHydra" }
    fn start_time(&self) -> Instant { self.base.start_time }
    fn is_ready(&self) -> bool { self.base.is_ready() }
    fn has_auth_secret(&self) -> bool { self.base.auth_secret.is_some() }

    fn api_keys_snapshot(&self) -> HashMap<String, String> {
        self.base.api_keys.try_read().map(|g| g.clone()).unwrap_or_default()
    }

    fn google_models_snapshot(&self) -> Vec<jaskier_core::model_registry::ModelInfo> {
        self.base.model_cache
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

// ── jaskier-core::prompt + handlers::agents trait implementations ─────────

impl jaskier_core::handlers::agents::HasAgentState for AppState {
    fn db(&self) -> &sqlx::PgPool { &self.base.db }
    fn agents(&self) -> &Arc<tokio::sync::RwLock<Vec<jaskier_core::models::WitcherAgent>>> {
        &self.base.agents
    }
    fn a2a_task_tx(&self) -> &tokio::sync::broadcast::Sender<()> {
        &self.base.a2a_task_tx
    }
    fn agent_table_prefix(&self) -> &'static str { "gh" }
    async fn refresh_agents(&self) {
        self.refresh_agents().await;
    }
}

// ── jaskier-core::mcp::server::HasMcpServerState ────────────────────────────

impl jaskier_core::mcp::server::HasMcpServerState for AppState {
    fn mcp_server_name(&self) -> &'static str { "GeminiHydra" }
    fn mcp_server_version(&self) -> &'static str { "15.0.0" }
    fn mcp_server_instructions(&self) -> &'static str {
        "GeminiHydra v15 \u{2014} Multi-Agent AI Swarm with native tools for code analysis, file operations, web scraping, OCR, image analysis, and MCP integration."
    }
    fn mcp_uri_scheme(&self) -> &'static str { "geminihydra" }
    fn mcp_settings_table(&self) -> &'static str { "gh_settings" }
    fn mcp_sessions_table(&self) -> &'static str { "gh_sessions" }
    async fn mcp_agents_json(&self) -> serde_json::Value {
        let agents = self.base.agents.read().await;
        serde_json::to_value(&*agents).unwrap_or_else(|_| serde_json::json!([]))
    }
    fn mcp_model_cache(&self) -> &Arc<RwLock<ModelCache>> { &self.base.model_cache }
    fn mcp_start_time(&self) -> Instant { self.base.start_time }
    fn mcp_is_ready(&self) -> bool { self.base.is_ready() }

    async fn mcp_system_snapshot_json(&self) -> serde_json::Value {
        let snap = self.base.system_monitor.read().await;
        serde_json::json!({
            "cpu_usage_percent": snap.cpu_usage_percent,
            "memory_used_mb": snap.memory_used_mb,
            "memory_total_mb": snap.memory_total_mb,
            "platform": snap.platform,
        })
    }

    async fn mcp_execute_tool(
        &self,
        name: &str,
        args: &serde_json::Value,
        working_directory: &str,
    ) -> Result<(String, Option<serde_json::Value>), String> {
        match crate::tools::execute_tool(name, args, self, working_directory).await {
            Ok(output) => {
                let inline = output.inline_data.map(|d| serde_json::json!({
                    "data": d.data,
                    "mime_type": d.mime_type,
                }));
                Ok((output.text, inline))
            }
            Err(e) => Err(e),
        }
    }
}

// ── jaskier-ai-modules::a2a::HasA2aState ────────────────────────────────────

impl jaskier_ai_modules::a2a::HasA2aState for AppState {
    type Agent = jaskier_core::models::WitcherAgent;

    fn agents(&self) -> &Arc<RwLock<Vec<jaskier_core::models::WitcherAgent>>> {
        &self.base.agents
    }

    fn a2a_app_name(&self) -> &str { "GeminiHydra" }
    fn a2a_app_url(&self) -> &str { "http://localhost:8081" }
    fn a2a_app_version(&self) -> &str { "15.0.0" }

    fn a2a_semaphore(&self) -> &Arc<tokio::sync::Semaphore> { &self.base.a2a_semaphore }
    fn a2a_task_tx(&self) -> &tokio::sync::broadcast::Sender<()> { &self.base.a2a_task_tx }
    fn a2a_cancel_tokens(&self) -> &Arc<RwLock<HashMap<String, tokio_util::sync::CancellationToken>>> {
        &self.base.a2a_cancel_tokens
    }

    fn send_swarm_notification(&self, agent_id: &str, content: String) {
        let _ = self.base.swarm_tx.send(jaskier_core::models::AgentMessage {
            agent_id: agent_id.to_string(),
            content,
            is_final: false,
        });
    }

    async fn circuit_check(&self) -> Result<(), String> {
        self.base.gemini_circuit.check().await
    }
    async fn circuit_success(&self) { self.base.gemini_circuit.record_success().await; }
    async fn circuit_failure(&self) { self.base.gemini_circuit.record_failure().await; }

    async fn prepare_a2a_context(
        &self,
        prompt: &str,
        model_override: Option<String>,
        agent_override: Option<(String, f64, String)>,
        session_wd: &str,
    ) -> jaskier_ai_modules::a2a::A2aContext {
        let ctx = crate::context::prepare_execution(self, prompt, model_override, agent_override, session_wd).await;
        jaskier_ai_modules::a2a::A2aContext {
            agent_id: ctx.agent_id,
            model: ctx.model,
            api_key: ctx.api_key,
            is_oauth: ctx.is_oauth,
            system_prompt: ctx.system_prompt,
            final_user_prompt: ctx.final_user_prompt,
            temperature: ctx.temperature,
            top_p: ctx.top_p,
            max_tokens: ctx.max_tokens,
            max_iterations: ctx.max_iterations,
            thinking_level: ctx.thinking_level,
            working_directory: ctx.working_directory,
            call_depth: ctx.call_depth,
        }
    }

    async fn build_a2a_tools(&self) -> serde_json::Value {
        crate::tool_defs::build_tools_with_mcp(self).await
    }

    async fn execute_a2a_tool(
        &self,
        name: &str,
        args: &serde_json::Value,
        working_dir: &str,
    ) -> Result<String, String> {
        crate::tools::execute_tool(name, args, self, working_dir)
            .await
            .map(|out| out.text)
    }

    fn build_a2a_thinking_config(&self, model: &str, thinking_level: &str) -> Option<serde_json::Value> {
        crate::prompt::build_thinking_config(model, thinking_level)
    }
}

// -- HasExecuteState -- Gemini-specific execute handler support ----------------

impl jaskier_core::handlers::execute::HasExecuteState for AppState {
    fn http_client(&self) -> &reqwest::Client {
        &self.base.client
    }

    fn circuit_breaker(&self) -> &std::sync::Arc<jaskier_core::circuit_breaker::CircuitBreaker> {
        &self.base.gemini_circuit
    }

    fn build_api_url(&self, model: &str) -> Result<reqwest::Url, String> {
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
            model
        );
        reqwest::Url::parse(&url)
            .ok()
            .filter(|u| u.scheme() == "https")
            .ok_or_else(|| "API credentials require HTTPS".to_string())
    }

    fn build_request_body(&self, ctx: &jaskier_core::context::ExecuteContext) -> serde_json::Value {
        let mut gen_config = serde_json::json!({
            "temperature": ctx.temperature,
            "topP": ctx.top_p,
            "maxOutputTokens": ctx.max_tokens
        });
        if let Some(tc) = crate::prompt::build_thinking_config(&ctx.model, &ctx.thinking_level) {
            gen_config["thinkingConfig"] = tc;
        }
        serde_json::json!({
            "systemInstruction": { "parts": [{ "text": ctx.system_prompt }] },
            "contents": [{ "parts": [{ "text": ctx.final_user_prompt }] }],
            "generationConfig": gen_config
        })
    }

    fn extract_text_from_response(&self, j: &serde_json::Value) -> Option<String> {
        j.get("candidates")
            .and_then(|c| c.get(0))
            .and_then(|c0| c0.get("content"))
            .and_then(|ct| ct.get("parts"))
            .and_then(|p| p.get(0))
            .and_then(|p0| p0.get("text"))
            .and_then(|t| t.as_str())
            .map(|s| s.to_string())
    }

    fn is_malformed_response(&self, j: &serde_json::Value) -> bool {
        j.get("candidates")
            .and_then(|c| c.get(0))
            .and_then(|c0| c0.get("finishReason"))
            .and_then(|v| v.as_str())
            == Some("MALFORMED_FUNCTION_CALL")
    }

    fn build_retry_body_for_malformed(&self, ctx: &jaskier_core::context::ExecuteContext) -> Option<serde_json::Value> {
        let mut gen_config = serde_json::json!({
            "temperature": ctx.temperature,
            "topP": ctx.top_p,
            "maxOutputTokens": ctx.max_tokens
        });
        if let Some(tc) = crate::prompt::build_thinking_config(&ctx.model, &ctx.thinking_level) {
            gen_config["thinkingConfig"] = tc;
        }
        Some(serde_json::json!({
            "systemInstruction": { "parts": [{ "text": format!("{}\n\nIMPORTANT: You are running in text-only mode. Do NOT attempt to call any tools or functions. Answer the user's question directly using your knowledge.", ctx.system_prompt) }] },
            "contents": [{ "parts": [{ "text": ctx.final_user_prompt }] }],
            "generationConfig": gen_config
        }))
    }

    fn format_diagnostic(&self, j: &serde_json::Value) -> String {
        jaskier_core::handlers::gemini_diagnose(j)
    }

    async fn execute_tool_by_name(
        &self,
        name: &str,
        args: &serde_json::Value,
        working_directory: &str,
    ) -> Result<String, String> {
        crate::tools::execute_tool(name, args, self, working_directory)
            .await
            .map(|o| o.text)
    }
}
