// GeminiHydra v15 — Model State
//
// Trait implementations related to AI model configuration: execution context
// construction, Google Generative Language API integration, MCP server surface,
// and file/tool execution plumbing. Separated from state.rs as part of
// B306-T5 decomposition.
//
// Imports AppState from the parent module (state.rs).

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use tokio::sync::RwLock;

use jaskier_hydra_state::ModelCache;

use crate::state::AppState;

// ── HasExecutionContext — shared prepare_execution logic ──────────────────────

/// Provides the common execution-context surface required by
/// `jaskier_core::context::prepare_execution`: agent list, prompt cache, MCP
/// client, and API credential resolution.
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

    /// Resolves the Google API key from environment variables. B13: credentials
    /// are injected by Vault at process startup via `GOOGLE_API_KEY` /
    /// `GEMINI_API_KEY` env vars.
    async fn resolve_api_credential(&self) -> (String, bool) {
        // B13: Credentials from env vars (Vault sets these)
        let key = std::env::var("GOOGLE_API_KEY")
            .or_else(|_| std::env::var("GEMINI_API_KEY"))
            .unwrap_or_default();
        (key, false)
    }

    fn extract_file_paths_from_prompt(&self, prompt: &str) -> Vec<String> {
        jaskier_tools::files::extract_file_paths(prompt)
    }

    async fn build_file_context_from_paths(&self, paths: &[String]) -> (String, usize) {
        let (ctx, errors) = jaskier_tools::files::build_file_context(paths).await;
        (ctx, errors.len())
    }
}

// ── HasExecuteState — Gemini-specific execute handler support ─────────────────

/// Implements the Gemini-specific HTTP execute handler: builds
/// `generativelanguage.googleapis.com` API URLs, constructs JSON request
/// bodies with optional `thinkingConfig`, and extracts text from Gemini
/// response candidates.
impl jaskier_core::handlers::execute::HasExecuteState for AppState {
    fn http_client(&self) -> &reqwest::Client {
        &self.base.client
    }

    fn circuit_breaker(&self) -> &std::sync::Arc<jaskier_core::circuit_breaker::CircuitBreaker> {
        &self.base.gemini_circuit
    }

    /// Builds a validated HTTPS URL for the Gemini `generateContent` endpoint.
    /// Returns an error if the model name produces an invalid or non-HTTPS URL.
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

    /// Constructs the Gemini REST request body from the execution context,
    /// including optional `thinkingConfig` for models that support extended
    /// reasoning.
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

    /// Extracts the text content from the first Gemini response candidate.
    fn extract_text_from_response(&self, j: &serde_json::Value) -> Option<String> {
        j.get("candidates")
            .and_then(|c| c.get(0))
            .and_then(|c0| c0.get("content"))
            .and_then(|ct| ct.get("parts"))
            .and_then(|p| p.get(0))
            .and_then(|p0| p0.get("text"))
            .and_then(|t| t.as_str())
            .map(std::string::ToString::to_string)
    }

    /// Returns `true` if the Gemini response indicates a `MALFORMED_FUNCTION_CALL`
    /// finish reason, which triggers a text-only retry.
    fn is_malformed_response(&self, j: &serde_json::Value) -> bool {
        j.get("candidates")
            .and_then(|c| c.get(0))
            .and_then(|c0| c0.get("finishReason"))
            .and_then(|v| v.as_str())
            == Some("MALFORMED_FUNCTION_CALL")
    }

    /// Builds a retry request body in text-only mode (no tool definitions)
    /// when a `MALFORMED_FUNCTION_CALL` is detected.
    fn build_retry_body_for_malformed(
        &self,
        ctx: &jaskier_core::context::ExecuteContext,
    ) -> Option<serde_json::Value> {
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

// ── HasMcpServerState — MCP server introspection ──────────────────────────────

/// Provides the MCP server surface for GeminiHydra: server identity, model
/// cache access, system snapshot, and proxied tool execution.
impl jaskier_core::mcp::server::HasMcpServerState for AppState {
    fn mcp_server_name(&self) -> &'static str {
        "GeminiHydra"
    }

    fn mcp_server_version(&self) -> &'static str {
        "15.0.0"
    }

    fn mcp_server_instructions(&self) -> &'static str {
        "GeminiHydra v15 \u{2014} Multi-Agent AI Swarm with native tools for code analysis, file operations, web scraping, OCR, image analysis, and MCP integration."
    }

    fn mcp_uri_scheme(&self) -> &'static str {
        "geminihydra"
    }

    fn mcp_settings_table(&self) -> &'static str {
        "gh_settings"
    }

    fn mcp_sessions_table(&self) -> &'static str {
        "gh_sessions"
    }

    async fn mcp_agents_json(&self) -> serde_json::Value {
        let agents = self.base.agents.read().await;
        serde_json::to_value(&*agents).unwrap_or_else(|_| serde_json::json!([]))
    }

    fn mcp_model_cache(&self) -> &Arc<RwLock<ModelCache>> {
        &self.base.model_cache
    }

    fn mcp_start_time(&self) -> Instant {
        self.base.start_time
    }

    fn mcp_is_ready(&self) -> bool {
        self.base.is_ready()
    }

    async fn mcp_system_snapshot_json(&self) -> serde_json::Value {
        let snap = self.base.system_monitor.read().await;
        serde_json::json!({
            "cpu_usage_percent": snap.cpu_usage_percent,
            "memory_used_mb": snap.memory_used_mb,
            "memory_total_mb": snap.memory_total_mb,
            "platform": snap.platform,
        })
    }

    /// Proxies a tool call through the GeminiHydra tool executor and converts
    /// the result into the `(text, optional_inline_data)` tuple expected by the
    /// MCP server trait.
    async fn mcp_execute_tool(
        &self,
        name: &str,
        args: &serde_json::Value,
        working_directory: &str,
    ) -> Result<(String, Option<serde_json::Value>), String> {
        match crate::tools::execute_tool(name, args, self, working_directory).await {
            Ok(output) => {
                let inline = output.inline_data.map(|d| {
                    serde_json::json!({
                        "data": d.data,
                        "mime_type": d.mime_type,
                    })
                });
                Ok((output.text, inline))
            }
            Err(e) => Err(e),
        }
    }
}
