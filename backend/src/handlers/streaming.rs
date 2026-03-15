// ---------------------------------------------------------------------------
// handlers/streaming.rs — WebSocket streaming, Gemini SSE parsing, ADK proxy
//
// Delegated to jaskier-core::handlers::gemini_streaming (shared crate).
// This file re-exports the public API and provides the trait impl for
// GeminiHydra's AppState.
// ---------------------------------------------------------------------------

use std::sync::Arc;

use serde_json::Value;
use uuid::Uuid;

use crate::state::AppState;

// ── Re-exports from shared crate ────────────────────────────────────────────

pub use jaskier_core::handlers::gemini_streaming::{
    // Public handler entry points (used in lib.rs routes)
    ws_execute,
    swarm_sse_handler,
    // Trait + types (used in trait impl below)
    HasGeminiStreamingState,
    GeminiToolOutput, GeminiInlineData,
};

// ── HasGeminiStreamingState trait impl for GeminiHydra ──────────────────────

impl HasGeminiStreamingState for AppState {
    fn db(&self) -> &sqlx::PgPool {
        &self.db
    }

    fn http_client(&self) -> &reqwest::Client {
        &self.client
    }

    fn ws_semaphore(&self) -> Arc<tokio::sync::Semaphore> {
        self.ws_semaphore.clone()
    }

    fn rate_limiter(&self) -> &Arc<jaskier_core::rate_limiter::GlobalRateLimiter> {
        &self.global_rate_limiter
    }

    async fn circuit_check(&self) -> Result<(), String> {
        self.gemini_circuit.check().await
    }
    async fn circuit_record_success(&self) {
        self.gemini_circuit.record_success().await;
    }
    async fn circuit_record_failure(&self) {
        self.gemini_circuit.record_failure().await;
    }

    fn auth_secret_value(&self) -> Option<&str> {
        self.auth_secret.as_deref()
    }

    fn swarm_tx(&self) -> &tokio::sync::broadcast::Sender<jaskier_core::models::AgentMessage> {
        &self.swarm_tx
    }

    fn sessions_table(&self) -> &'static str {
        "gh_sessions"
    }

    fn messages_table(&self) -> &'static str {
        "gh_chat_messages"
    }

    fn settings_table(&self) -> &'static str {
        "gh_settings"
    }

    fn agent_usage_table(&self) -> &'static str {
        "gh_agent_usage"
    }

    async fn prepare_execution_ctx(
        &self,
        prompt: &str,
        model_override: Option<String>,
        agent_info: Option<(String, f64, String)>,
        session_wd: &str,
    ) -> jaskier_core::context::ExecuteContext {
        crate::context::prepare_execution(self, prompt, model_override, agent_info, session_wd)
            .await
    }

    async fn build_tools_json(&self) -> Value {
        crate::tool_defs::build_tools_with_mcp(self).await
    }

    fn build_thinking_config(&self, model: &str, thinking_level: &str) -> Option<Value> {
        jaskier_core::prompt::build_thinking_config(model, thinking_level)
    }

    async fn execute_tool_call(
        &self,
        name: &str,
        args: &Value,
        working_directory: &str,
    ) -> Result<GeminiToolOutput, String> {
        match crate::tools::execute_tool(name, args, self, working_directory).await {
            Ok(output) => Ok(GeminiToolOutput {
                text: output.text,
                inline_data: output.inline_data.map(|d| GeminiInlineData {
                    mime_type: d.mime_type,
                    data: d.data,
                }),
            }),
            Err(e) => Err(e.to_string()),
        }
    }

    async fn execute_agent_call(
        &self,
        args: &Value,
        call_depth: u32,
    ) -> Result<String, String> {
        crate::a2a::execute_agent_call(self, args, call_depth).await
    }

    async fn resolve_session_agent(
        &self,
        session_id: &Uuid,
        prompt: &str,
    ) -> (String, f64, String) {
        // Check if session has a locked agent
        if let Some(aid) = sqlx::query_as::<_, (Option<String>,)>(
            "SELECT agent_id FROM gh_sessions WHERE id = $1",
        )
        .bind(session_id)
        .fetch_optional(&self.db)
        .await
        .map_err(|e| tracing::error!("Failed to resolve session agent: {}", e))
        .ok()
        .flatten()
        .and_then(|(a,)| a)
        .filter(|s| !s.is_empty())
        {
            return (aid, 0.95, "Locked".into());
        }

        // Classify the prompt
        let agents = self.agents.read().await;
        let (aid, conf, reas) = crate::classify::classify_prompt(prompt, &agents, "eskel");

        // Lock the agent to the session
        if let Err(e) = sqlx::query("UPDATE gh_sessions SET agent_id = $1 WHERE id = $2")
            .bind(&aid)
            .bind(session_id)
            .execute(&self.db)
            .await
        {
            tracing::error!("Failed to lock session agent: {}", e);
        }
        (aid, conf, reas)
    }

    async fn get_fallback_model_id(&self, use_case: &str) -> String {
        crate::model_registry::get_model_id(self, use_case).await
    }

    fn compute_usage_tier(&self, model: &str) -> String {
        if model.contains("flash") {
            "flash".to_string()
        } else if model.contains("thinking") {
            "thinking".to_string()
        } else {
            "chat".to_string()
        }
    }
}
