// ---------------------------------------------------------------------------
// handlers/streaming.rs — WebSocket streaming, Gemini SSE parsing, ADK proxy
// ---------------------------------------------------------------------------

use std::collections::HashMap;
use std::time::{Duration, Instant};

use axum::extract::State;
use axum::extract::ws::{Message as WsMessage, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures_util::{SinkExt, StreamExt};
use rand::Rng;
use serde_json::{Value, json};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::models::{WsClientMessage, WsServerMessage};
use crate::state::AppState;

use crate::context::{ExecuteContext, prepare_execution};
use crate::prompt::build_thinking_config;
use crate::tool_defs::build_tools_with_mcp;

// ---------------------------------------------------------------------------
// SSE Parser
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
enum SseParsedEvent {
    TextToken(String),
    FunctionCall {
        name: String,
        args: Value,
        raw_part: Value,
    },
    MalformedFunctionCall,
}

struct SseParser {
    buffer: String,
    tool_calls: std::collections::HashMap<usize, (String, String)>,
}

impl SseParser {
    fn new() -> Self {
        Self {
            buffer: String::new(),
            tool_calls: std::collections::HashMap::new(),
        }
    }

    fn parse_parts(&mut self, json_val: &Value) -> Vec<SseParsedEvent> {
        let mut events = Vec::new();
        if let Some(choices) = json_val.get("choices").and_then(|c| c.as_array()) {
            for choice in choices {
                if let Some(delta) = choice.get("delta") {
                    if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                        if !content.is_empty() {
                            events.push(SseParsedEvent::TextToken(content.to_string()));
                        }
                    }
                    if let Some(tcs) = delta.get("tool_calls").and_then(|tc| tc.as_array()) {
                        for tc in tcs {
                            if let Some(index) = tc.get("index").and_then(|i| i.as_u64()).map(|i| i as usize) {
                                let entry = self.tool_calls.entry(index).or_insert_with(|| (String::new(), String::new()));
                                if let Some(function) = tc.get("function") {
                                    if let Some(name) = function.get("name").and_then(|n| n.as_str()) {
                                        entry.0 = name.to_string();
                                    }
                                    if let Some(args) = function.get("arguments").and_then(|a| a.as_str()) {
                                        entry.1.push_str(args);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        events
    }

    fn flush_tools(&mut self) -> Vec<SseParsedEvent> {
        let mut events = Vec::new();
        let mut indices: Vec<usize> = self.tool_calls.keys().copied().collect();
        indices.sort_unstable();
        for idx in indices {
            if let Some((name, args_str)) = self.tool_calls.remove(&idx) {
                let args = serde_json::from_str(&args_str).unwrap_or_else(|_| json!({}));
                events.push(SseParsedEvent::FunctionCall {
                    name,
                    args,
                    raw_part: json!({}),
                });
            }
        }
        events
    }

    fn feed(&mut self, chunk: &str) -> Vec<SseParsedEvent> {
        self.buffer.push_str(chunk);
        let mut events = Vec::new();
        while let Some(pos) = self.buffer.find("\n\n") {
            let block = self.buffer[..pos].to_string();
            self.buffer = self.buffer[pos + 2..].to_string();
            for line in block.lines() {
                if let Some(data) = line.strip_prefix("data: ") {
                    let d = data.trim();
                    if d == "[DONE]" {
                        events.extend(self.flush_tools());
                    } else if !d.is_empty() {
                        if let Ok(jv) = serde_json::from_str::<Value>(d) {
                            events.extend(self.parse_parts(&jv));
                        }
                    }
                }
            }
        }
        events
    }

    fn flush(&mut self) -> Vec<SseParsedEvent> {
        let mut events = Vec::new();
        let buffer_copy = self.buffer.clone();
        for line in buffer_copy.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                let d = data.trim();
                if d == "[DONE]" {
                    events.extend(self.flush_tools());
                } else if !d.is_empty() {
                    if let Ok(jv) = serde_json::from_str::<Value>(d) {
                        events.extend(self.parse_parts(&jv));
                    }
                }
            }
        }
        self.buffer.clear();
        events.extend(self.flush_tools());
        events
    }
}

// ---------------------------------------------------------------------------
// Truncation & Constants
// ---------------------------------------------------------------------------

const MAX_TOOL_RESULT_FOR_CONTEXT: usize = 25000;
const TOOL_TIMEOUT: Duration = Duration::from_secs(30);

const GEMINI_MAX_RETRIES: u32 = 3;
const GEMINI_BACKOFF_BASE: Duration = Duration::from_secs(1);
const GEMINI_BACKOFF_JITTER_MS: u64 = 500;
const MAX_CONVERSATION_MESSAGES: usize = 80;

fn trim_conversation(contents: &mut Vec<Value>) {
    if contents.len() <= MAX_CONVERSATION_MESSAGES {
        return;
    }
    let keep_head = 2; // system prompt + first user msg
    let keep_tail = MAX_CONVERSATION_MESSAGES.saturating_sub(keep_head);
    let remove_start = keep_head;
    let remove_end = contents.len().saturating_sub(keep_tail);
    if remove_end > remove_start {
        let removed = remove_end - remove_start;
        contents.drain(remove_start..remove_end);
        contents.insert(
            keep_head,
            json!({
                "role": "user",
                "content": format!(
                    "[Earlier conversation trimmed — {} messages removed for context management]",
                    removed
                )
            }),
        );
        tracing::debug!(
            "trim_conversation: removed {} messages, {} remaining",
            removed,
            contents.len()
        );
    }
}

#[allow(dead_code)]
fn truncate_for_context(output: &str) -> String {
    truncate_for_context_with_limit(output, MAX_TOOL_RESULT_FOR_CONTEXT)
}

fn truncate_for_context_with_limit(output: &str, limit: usize) -> String {
    if output.len() <= limit {
        return output.to_string();
    }
    let boundary = output
        .char_indices()
        .take_while(|(i, _)| *i < limit)
        .last()
        .map(|(i, c)| i + c.len_utf8())
        .unwrap_or(0);
    format!(
        "{}\n\n[Output truncated from {} to {} chars. Ask for specific sections if needed. ANALYZE what you see instead of reading more.]",
        &output[..boundary],
        output.len(),
        boundary,
    )
}

async fn ws_send(
    sender: &mut futures_util::stream::SplitSink<WebSocket, WsMessage>,
    msg: &WsServerMessage,
) -> bool {
    if let Ok(json) = serde_json::to_string(msg) {
        sender.send(WsMessage::Text(json.into())).await.is_ok()
    } else {
        false
    }
}

// ---------------------------------------------------------------------------
// WebSocket Handler
// ---------------------------------------------------------------------------

pub async fn ws_execute(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let query_str = params
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("&");

    if !crate::auth::validate_ws_token(&query_str, state.auth_secret.as_deref()) {
        return (axum::http::StatusCode::UNAUTHORIZED, "Unauthorized").into_response();
    }

    let permit = match state.ws_semaphore.clone().try_acquire_owned() {
        Ok(permit) => permit,
        Err(_) => {
            tracing::warn!("WebSocket connection rejected — concurrent limit reached (20)");
            return (
                axum::http::StatusCode::SERVICE_UNAVAILABLE,
                "Too many concurrent WebSocket connections",
            )
                .into_response();
        }
    };

    ws.max_message_size(256 * 1024)
        .on_upgrade(move |socket| handle_ws(socket, state, permit))
        .into_response()
}

async fn handle_ws(socket: WebSocket, state: AppState, _permit: tokio::sync::OwnedSemaphorePermit) {
    let (mut sender, mut receiver) = socket.split();
    let mut cancel = CancellationToken::new();

    loop {
        tokio::select! {
            msg = receiver.next() => {
                match msg {
                    Some(Ok(WsMessage::Text(text))) => {
                        let client_msg: WsClientMessage = match serde_json::from_str(&text) {
                            Ok(m) => m,
                            Err(e) => {
                                tracing::warn!("ws_execute: invalid client message: {}", e);
                                let _ = ws_send(&mut sender, &WsServerMessage::Error { message: "Invalid message format".to_string(), code: Some("PARSE_ERROR".into()) }).await;
                                continue;
                            }
                        };
                        match client_msg {
                            WsClientMessage::Ping => { let _ = ws_send(&mut sender, &WsServerMessage::Pong).await; }
                            WsClientMessage::Cancel => { cancel.cancel(); }
                            WsClientMessage::Execute { prompt, mode, model, session_id } => {
                                cancel = CancellationToken::new();
                                execute_streaming(&mut sender, &state, &prompt, mode, model, session_id, cancel.child_token()).await;
                            }
                            WsClientMessage::Orchestrate { prompt, pattern, agents, session_id } => {
                                cancel = CancellationToken::new();
                                execute_orchestrated(&mut sender, &state, &prompt, &pattern, agents.as_deref(), session_id, cancel.child_token()).await;
                            }
                            WsClientMessage::ToolResponse { tool_name, response } => {
                                tracing::info!("Received ToolResponse from client for {}: {}", tool_name, response);
                            }
                        }
                    }
                    Some(Ok(WsMessage::Ping(data))) => {
                        let _ = sender.send(WsMessage::Pong(data)).await;
                    }
                    Some(Ok(_)) => {}
                    _ => break,
                }
            }
        }
    }
}

// (Omitted ADK Orchestration for brevity as it's a proxy)
async fn execute_orchestrated(
    sender: &mut futures_util::stream::SplitSink<WebSocket, WsMessage>,
    state: &AppState,
    prompt: &str,
    pattern: &str,
    agents: Option<&[String]>,
    session_id: Option<String>,
    cancel: CancellationToken,
) {
    let start = Instant::now();
    let _ = ws_send(
        sender,
        &WsServerMessage::Error {
            message: "ADK sidecar unavailable in this version".to_string(),
            code: Some("ADK_UNAVAILABLE".into()),
        },
    ).await;
}

// ---------------------------------------------------------------------------
// Streaming Execution Engine
// ---------------------------------------------------------------------------

async fn execute_streaming(
    sender: &mut futures_util::stream::SplitSink<WebSocket, WsMessage>,
    state: &AppState,
    prompt: &str,
    mode: String,
    model_override: Option<String>,
    session_id: Option<String>,
    cancel: CancellationToken,
) {
    let start = Instant::now();
    let sid = session_id.as_deref().and_then(|s| Uuid::parse_str(s).ok());

    let agent_info = if !mode.is_empty() && mode != "auto" {
        let agents = state.agents.read().await;
        agents
            .iter()
            .find(|a| a.id == mode || a.name.to_lowercase() == mode.to_lowercase())
            .map(|a| {
                (
                    a.id.clone(),
                    0.99_f64,
                    "User explicitly selected agent via mode field".to_string(),
                )
            })
    } else if let Some(s) = &sid {
        Some(resolve_session_agent(state, s, prompt).await)
    } else {
        None
    };

    let session_wd: String = if let Some(ref s) = sid {
        sqlx::query_scalar("SELECT working_directory FROM gh_sessions WHERE id = $1")
            .bind(s)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten()
            .unwrap_or_default()
    } else {
        String::new()
    };

    let ctx = prepare_execution(state, prompt, model_override, agent_info, &session_wd).await;
    let resp_id = Uuid::new_v4();

    if !ws_send(
        sender,
        &WsServerMessage::Start {
            id: resp_id.to_string(),
            agent: ctx.agent_id.clone(),
            model: ctx.model.clone(),
            files_loaded: ctx.files_loaded.clone(),
        },
    )
    .await
    {
        return;
    }
    let _ = ws_send(
        sender,
        &WsServerMessage::Plan {
            agent: ctx.agent_id.clone(),
            confidence: ctx.confidence,
            steps: ctx.steps.clone(),
            reasoning: ctx.reasoning.clone(),
        },
    )
    .await;

    let full_text = execute_streaming_openai(sender, state, &ctx, sid, cancel.clone()).await;
    
    store_messages(&state.db, sid, resp_id, prompt, &full_text, &ctx).await;

    let latency = start.elapsed().as_millis() as i32;
    let success = !full_text.is_empty();
    let input_est = (prompt.len() / 4) as i32;
    let output_est = (full_text.len() / 4) as i32;
    let db = state.db.clone();
    let agent_id = ctx.agent_id.clone();
    let model = ctx.model.clone();
    tokio::spawn(async move {
        if let Err(e) = sqlx::query(
            "INSERT INTO gh_agent_usage (agent_id, model, input_tokens, output_tokens, total_tokens, latency_ms, success, tier)              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        )
        .bind(&agent_id)
        .bind(&model)
        .bind(input_est)
        .bind(output_est)
        .bind(input_est + output_est)
        .bind(latency)
        .bind(success)
        .bind("chat")
        .execute(&db)
        .await
        {
            tracing::error!("Failed to insert agent usage metrics: {}", e);
        }
    });

    let _ = ws_send(
        sender,
        &WsServerMessage::Complete {
            duration_ms: start.elapsed().as_millis() as u64,
        },
    )
    .await;
}

fn is_retryable(result: &Result<reqwest::Response, reqwest::Error>) -> bool {
    match result {
        Ok(resp) => {
            let status = resp.status().as_u16();
            status == 429 || status == 503
        }
        Err(e) => e.is_timeout() || e.is_connect(),
    }
}

async fn api_request_with_retry(
    client: &reqwest::Client,
    url: &reqwest::Url,
    api_key: &str,
    is_oauth: bool,
    body: &Value,
) -> Result<reqwest::Response, String> {
    let mut last_err = String::new();

    for attempt in 0..=GEMINI_MAX_RETRIES {
        if attempt > 0 {
            let backoff = GEMINI_BACKOFF_BASE * 2u32.saturating_pow(attempt - 1);
            let jitter =
                Duration::from_millis(rand::rng().random_range(0..=GEMINI_BACKOFF_JITTER_MS));
            let delay = backoff + jitter;
            tracing::warn!("api_retry: attempt {}/{} after {:?} delay", attempt + 1, GEMINI_MAX_RETRIES + 1, delay);
            tokio::time::sleep(delay).await;
        }

        // Apply google auth if it's oauth, else just bearer
        let req = if is_oauth {
            crate::oauth::apply_google_auth(client.post(url.clone()), api_key, is_oauth)
        } else {
            client.post(url.clone()).header("Authorization", format!("Bearer {}", api_key))
        };

        let result = req.json(body).timeout(Duration::from_secs(300)).send().await;

        if !is_retryable(&result) {
            return match result {
                Ok(resp) if resp.status().is_success() => Ok(resp),
                Ok(resp) => {
                    let status = resp.status();
                    let err_body = resp.text().await.unwrap_or_default();
                    Err(format!("API error ({}): {}", status, err_body))
                }
                Err(e) => Err(format!("API request failed: {:?}", e)),
            };
        }

        last_err = match &result {
            Ok(resp) => format!("HTTP {}", resp.status()),
            Err(e) => format!("{:?}", e),
        };
    }

    Err(format!("API failed after {} attempts: {}", GEMINI_MAX_RETRIES + 1, last_err))
}

async fn execute_streaming_openai(
    sender: &mut futures_util::stream::SplitSink<WebSocket, WsMessage>,
    state: &AppState,
    ctx: &ExecuteContext,
    sid: Option<Uuid>,
    cancel: CancellationToken,
) -> String {
    if ctx.api_key.is_empty() {
        let _ = ws_send(
            sender,
            &WsServerMessage::Error {
                message: "Missing API Key".into(),
                code: Some("NO_API_KEY".into()),
            },
        ).await;
        return String::new();
    }

    if let Err(msg) = state.gemini_circuit.check().await {
        tracing::warn!("execute_streaming_openai: {}", msg);
        let _ = ws_send(
            sender,
            &WsServerMessage::Error {
                message: msg,
                code: Some("CIRCUIT_OPEN".into()),
            },
        ).await;
        return String::new();
    }

    let base_url = if cfg!(feature = "deepseek") || env!("CARGO_PKG_NAME").contains("DeepSeek") {
        "https://api.deepseek.com/chat/completions"
    } else if cfg!(feature = "grok") || env!("CARGO_PKG_NAME").contains("Grok") {
        "https://api.x.ai/v1/chat/completions"
    } else {
        "https://api.openai.com/v1/chat/completions"
    };

    let parsed_url = match reqwest::Url::parse(base_url) {
        Ok(u) => u,
        _ => return String::new(),
    };

    let tools = build_tools_with_mcp(state).await;
    let mut contents = if let Some(s) = &sid {
        load_session_history(&state.db, s).await
    } else {
        Vec::new()
    };
    
    // Add system prompt first
    contents.insert(0, json!({ "role": "system", "content": ctx.system_prompt }));
    contents.push(json!({ "role": "user", "content": ctx.final_user_prompt }));

    let prompt_len = ctx.final_user_prompt.len();
    let file_count = ctx.files_loaded.len();
    let dynamic_floor: usize = if prompt_len < 200 && file_count <= 1 { 15 } else if prompt_len < 1000 && file_count <= 3 { 20 } else { 25 };
    let max_iterations: usize = dynamic_floor.max(ctx.max_iterations.max(1) as usize);

    let mut full_text = String::new();
    let mut has_written_file = false;
    let mut agent_text_len: usize = 0;
    
    let execution_start = Instant::now();
    let execution_timeout = Duration::from_secs(300);

    for iter in 0..max_iterations {
        if execution_start.elapsed() >= execution_timeout {
            let _ = ws_send(
                sender,
                &WsServerMessage::Error {
                    message: "Execution timed out after 5 minutes".to_string(),
                    code: Some("TIMEOUT".to_string()),
                },
            ).await;
            break;
        }

        let _ = ws_send(
            sender,
            &WsServerMessage::Iteration {
                number: iter as u32 + 1,
                max: max_iterations as u32,
            },
        ).await;

        trim_conversation(&mut contents);

        let mut body = json!({
            "model": ctx.model,
            "messages": contents,
            "stream": true,
            "temperature": ctx.temperature,
            "top_p": ctx.top_p,
        });
        
        // Deepseek specific fixes
        if base_url.contains("deepseek") {
            // max_tokens instead of max_completion_tokens
            if let Some(obj) = body.as_object_mut() {
                obj.insert("max_tokens".into(), json!(ctx.max_tokens));
            }
        } else {
            if let Some(obj) = body.as_object_mut() {
                obj.insert("max_completion_tokens".into(), json!(ctx.max_tokens));
            }
        }

        // Only add tools if there are tools (and not empty array)
        if let Some(tools_arr) = tools.as_array() {
            if !tools_arr.is_empty() {
                if let Some(obj) = body.as_object_mut() {
                    obj.insert("tools".into(), tools.clone());
                }
            }
        }

        let resp = match api_request_with_retry(
            &state.client,
            &parsed_url,
            &ctx.api_key,
            ctx.is_oauth,
            &body,
        ).await {
            Ok(r) => {
                state.gemini_circuit.record_success().await;
                r
            }
            Err(e) => {
                state.gemini_circuit.record_failure().await;
                tracing::error!("{}", e);
                let _ = ws_send(
                    sender,
                    &WsServerMessage::Error {
                        message: "AI service error".into(),
                        code: Some("API_ERROR".into()),
                    },
                ).await;
                return full_text;
            }
        };

        let (text, fcs, aborted, _) = consume_openai_stream(resp, sender, &cancel).await;
        full_text.push_str(&text);
        agent_text_len += text.trim().len();
        
        // Add assistant reply to history
        let mut asst_msg = json!({ "role": "assistant", "content": text });
        if !fcs.is_empty() {
            let mut tool_calls = Vec::new();
            for (idx, fc) in fcs.iter().enumerate() {
                tool_calls.push(json!({
                    "id": format!("call_{}", idx),
                    "type": "function",
                    "function": {
                        "name": fc.0,
                        "arguments": serde_json::to_string(&fc.1).unwrap_or_else(|_| "{}".into())
                    }
                }));
            }
            asst_msg.as_object_mut().unwrap().insert("tool_calls".into(), json!(tool_calls));
        }
        contents.push(asst_msg);

        if aborted || fcs.is_empty() {
            break; // No more tool calls, we're done
        }

        // Execute tools
        // We will collect tool responses as tool messages
        for (idx, (name, args)) in fcs.into_iter().enumerate() {
            let _ = ws_send(
                sender,
                &WsServerMessage::ToolCall {
                    name: name.clone(),
                    args: args.clone(),
                    iteration: iter as u32 + 1,
                },
            ).await;

            let wd = sqlx::query_scalar("SELECT working_directory FROM gh_settings WHERE id = 1")
                .fetch_one(&state.db)
                .await
                .unwrap_or_else(|_| String::new());

            let exec_result = tokio::time::timeout(
                TOOL_TIMEOUT,
                crate::tools::execute_tool(&name, &args, state, &wd),
            ).await;

            let result_str = match exec_result {
                Ok(Ok(output)) => {
                    if name == "write_file" || name == "edit_file" || name == "delete_file" {
                        has_written_file = true;
                    }
                    output.text
                }
                Ok(Err(e)) => e.to_string(),
                Err(_) => "Tool execution timed out".to_string(),
            };

            let _ = ws_send(
                sender,
                &WsServerMessage::ToolResult {
                    name: name.clone(),
                    success: !result_str.contains("failed") && !result_str.contains("error"),
                    summary: result_str.chars().take(200).collect(),
                    iteration: iter as u32 + 1,
                },
            ).await;

            contents.push(json!({
                "role": "tool",
                "tool_call_id": format!("call_{}", idx),
                "name": name,
                "content": truncate_for_context(&result_str)
            }));
        }
    }

    full_text
}

async fn consume_openai_stream(
    resp: reqwest::Response,
    sender: &mut futures_util::stream::SplitSink<WebSocket, WsMessage>,
    cancel: &CancellationToken,
) -> (String, Vec<(String, Value)>, bool, bool) {
    let mut stream = resp.bytes_stream();
    let mut text_acc = String::new();
    let mut parser = SseParser::new();
    let mut fcs = Vec::new();
    let mut aborted = false;

    while let Some(chunk) = stream.next().await {
        if cancel.is_cancelled() {
            aborted = true;
            break;
        }
        match chunk {
            Ok(bytes) => {
                let chunk_str = String::from_utf8_lossy(&bytes);
                let events = parser.feed(&chunk_str);
                for ev in events {
                    match ev {
                        SseParsedEvent::TextToken(t) => {
                            text_acc.push_str(&t);
                            let _ = ws_send(sender, &WsServerMessage::Token { content: t }).await;
                        }
                        SseParsedEvent::FunctionCall { name, args, .. } => {
                            fcs.push((name, args));
                        }
                        _ => {}
                    }
                }
            }
            Err(_) => break,
        }
    }

    let events = parser.flush();
    for ev in events {
        match ev {
            SseParsedEvent::TextToken(t) => {
                text_acc.push_str(&t);
                let _ = ws_send(sender, &WsServerMessage::Token { content: t }).await;
            }
            SseParsedEvent::FunctionCall { name, args, .. } => {
                fcs.push((name, args));
            }
            _ => {}
        }
    }

    (text_acc, fcs, aborted, false)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async fn resolve_session_agent(state: &AppState, session_id: &Uuid, prompt: &str) -> (String, f64, String) {
    let mut aid = "eskel".to_string();
    let mut conf = 1.0;
    let mut reas = "Default fallback agent".to_string();

    if let Ok(Some(row)) = sqlx::query_as::<_, (Option<String>,)>("SELECT agent_id FROM gh_sessions WHERE id = $1")
        .bind(session_id)
        .fetch_optional(&state.db)
        .await
    {
        if let Some(agent_id) = row.0 {
            aid = agent_id;
            reas = "Session is locked to this agent".to_string();
            return (aid, conf, reas);
        }
    }

    let classifier_url = std::env::var("ADK_CLASSIFIER_URL").unwrap_or_else(|_| "http://localhost:8000".to_string());
    let req_body = json!({
        "prompt": prompt,
        "history": [],
        "available_agents": ["eskel", "lambert", "triss", "yennefer", "jaskier", "dijkstra", "geralt", "zoltan", "philippa", "ciri", "regis", "vesemir"]
    });

    match state.client.post(format!("{}/api/classify", classifier_url))
        .json(&req_body)
        .timeout(Duration::from_secs(3))
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => {
            if let Ok(json) = res.json::<Value>().await {
                if let Some(agent) = json.get("agent_id").and_then(|a| a.as_str()) {
                    aid = agent.to_string();
                }
                if let Some(c) = json.get("confidence").and_then(|c| c.as_f64()) {
                    conf = c;
                }
                if let Some(r) = json.get("reasoning").and_then(|r| r.as_str()) {
                    reas = r.to_string();
                }
            }
        }
        _ => {}
    }

    if let Err(e) = sqlx::query("UPDATE gh_sessions SET agent_id = $1 WHERE id = $2")
        .bind(&aid)
        .bind(session_id)
        .execute(&state.db)
        .await
    {
        tracing::error!("Failed to lock session agent: {}", e);
    }
    (aid, conf, reas)
}

async fn load_session_history(db: &sqlx::PgPool, sid: &Uuid) -> Vec<Value> {
    let mut messages: Vec<Value> = sqlx::query_as::<_, (String, String)>(
        "SELECT role, content FROM gh_chat_messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT 20"
    )
        .bind(sid).fetch_all(db).await.unwrap_or_else(|e| {
            tracing::error!("Failed to load session history: {}", e);
            vec![]
        }).into_iter().rev()
        .map(|(r, c)| json!({ "role": if r == "model" { "assistant" } else if r == "assistant" { "assistant" } else { "user" }, "content": c }))
        .collect();

    for i in 0..messages.len() {
        if i < messages.len().saturating_sub(6)
            && let Some(text) = messages[i].get_mut("content")
            && let Some(s) = text.as_str().map(|s| s.to_string())
            && s.len() > 500
        {
            let boundary = s
                .char_indices()
                .take_while(|(idx, _)| *idx < 500)
                .last()
                .map(|(idx, c)| idx + c.len_utf8())
                .unwrap_or(500.min(s.len()));
            *text = json!(format!(
                "{}... [message truncated for context efficiency]",
                &s[..boundary]
            ));
        }
    }

    messages
}

async fn store_messages(
    db: &sqlx::PgPool,
    sid: Option<Uuid>,
    rid: Uuid,
    prompt: &str,
    result: &str,
    ctx: &ExecuteContext,
) {
    if let Err(e) = sqlx::query("INSERT INTO gh_chat_messages (id, role, content, model, agent, session_id) VALUES ($1, 'user', $2, $3, $4, $5)")
        .bind(rid).bind(prompt).bind(Some(&ctx.model)).bind(Some(&ctx.agent_id)).bind(sid).execute(db).await
    {
        tracing::error!("Failed to store chat message: {}", e);
    }
    if !result.is_empty()
        && let Err(e) = sqlx::query("INSERT INTO gh_chat_messages (id, role, content, model, agent, session_id) VALUES ($1, 'assistant', $2, $3, $4, $5)")
            .bind(Uuid::new_v4()).bind(result).bind(Some(&ctx.model)).bind(Some(&ctx.reasoning)).bind(sid).execute(db).await
        {
            tracing::error!("Failed to store response message: {}", e);
        }
}

// ── Agent Swarm SSE Integration ──────────────────────────────────────

use axum::response::sse::{Event, Sse};
use futures_util::stream::Stream;
use std::convert::Infallible;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AgentMessage {
    pub agent_id: String,
    pub content: String,
    pub is_final: bool,
}

pub async fn swarm_sse_handler(
    axum::extract::State(state): axum::extract::State<crate::state::AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let mut rx = state.swarm_tx.subscribe();

    let stream = async_stream::stream! {
        while let Ok(msg) = rx.recv().await {
            let json_str = serde_json::to_string(&msg).unwrap_or_default();
            yield Ok(Event::default().data(json_str));
        }
    };

    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(std::time::Duration::from_secs(15))
            .text("keep-alive"),
    )
}
