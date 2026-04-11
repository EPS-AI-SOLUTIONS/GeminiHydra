// GeminiHydra v15 — Session State
//
// Trait implementations related to agent session management and A2A
// (Agent-to-Agent) task orchestration. Separated from state.rs as part of
// B306-T5 decomposition to keep AppState concerns focused.
//
// Imports AppState from the parent module (state.rs).

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;

use crate::state::AppState;

// ── HasAgentState — agent CRUD + refresh ─────────────────────────────────────

/// Provides access to the agent registry stored in the database and the
/// in-memory `Arc<RwLock<Vec<WitcherAgent>>>` cache.
impl jaskier_core::handlers::agents::HasAgentState for AppState {
    fn db(&self) -> &sqlx::PgPool {
        &self.base.db
    }

    fn agents(&self) -> &Arc<tokio::sync::RwLock<Vec<jaskier_core::models::WitcherAgent>>> {
        &self.base.agents
    }

    fn a2a_task_tx(&self) -> &tokio::sync::broadcast::Sender<()> {
        &self.base.a2a_task_tx
    }

    fn agent_table_prefix(&self) -> &'static str {
        "gh"
    }

    async fn refresh_agents(&self) {
        self.refresh_agents().await;
    }
}

// ── HasA2aState — A2A v0.3 inter-agent delegation ────────────────────────────

/// Provides the state surface required by the A2A (Agent-to-Agent) v0.3
/// protocol: agent list, semaphore for concurrency control, circuit breaker
/// for provider health, and execution context construction.
impl jaskier_ai_modules::a2a::HasA2aState for AppState {
    type Agent = jaskier_core::models::WitcherAgent;

    fn agents(&self) -> &Arc<RwLock<Vec<jaskier_core::models::WitcherAgent>>> {
        &self.base.agents
    }

    fn a2a_app_name(&self) -> &str {
        "GeminiHydra"
    }

    fn a2a_app_url(&self) -> &str {
        "http://localhost:8081"
    }

    fn a2a_app_version(&self) -> &str {
        "15.0.0"
    }

    fn a2a_semaphore(&self) -> &Arc<tokio::sync::Semaphore> {
        &self.base.a2a_semaphore
    }

    fn a2a_task_tx(&self) -> &tokio::sync::broadcast::Sender<()> {
        &self.base.a2a_task_tx
    }

    fn a2a_cancel_tokens(
        &self,
    ) -> &Arc<RwLock<HashMap<String, tokio_util::sync::CancellationToken>>> {
        &self.base.a2a_cancel_tokens
    }

    /// Broadcasts a swarm notification message to all connected WebSocket clients
    /// listening on the swarm broadcast channel.
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

    async fn circuit_success(&self) {
        self.base.gemini_circuit.record_success().await;
    }

    async fn circuit_failure(&self) {
        self.base.gemini_circuit.record_failure().await;
    }

    /// Constructs an [`A2aContext`] from an execution context built by the
    /// GeminiHydra-specific `context::prepare_execution` function.
    async fn prepare_a2a_context(
        &self,
        prompt: &str,
        model_override: Option<String>,
        agent_override: Option<(String, f64, String)>,
        session_wd: &str,
    ) -> jaskier_ai_modules::a2a::A2aContext {
        let ctx = crate::context::prepare_execution(
            self,
            prompt,
            model_override,
            agent_override,
            session_wd,
        )
        .await;
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

    fn build_a2a_thinking_config(
        &self,
        model: &str,
        thinking_level: &str,
    ) -> Option<serde_json::Value> {
        crate::prompt::build_thinking_config(model, thinking_level)
    }
}
