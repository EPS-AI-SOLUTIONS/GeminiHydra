// ---------------------------------------------------------------------------
// handlers/agents.rs â€” Agent CRUD + classification endpoints
// ---------------------------------------------------------------------------

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use serde_json::{Value, json};

use crate::models::{
    AgentProfile, ClassifyRequest, ClassifyResponse, CreateAgentProfile, WitcherAgent,
};
use crate::state::AppState;

use crate::classify::classify_prompt;

// ---------------------------------------------------------------------------
// Agent List & Classification
// ---------------------------------------------------------------------------

#[utoipa::path(get, path = "/api/agents", tag = "agents",
    responses((status = 200, description = "List of configured agents", body = Value))
)]
pub async fn list_agents(State(state): State<AppState>) -> impl IntoResponse {
    let agents = state.agents.read().await;
    // #6 â€” Cache agent list for 60 seconds
    (
        [(axum::http::header::CACHE_CONTROL, "public, max-age=60")],
        Json(json!({ "agents": *agents })),
    )
}

#[utoipa::path(post, path = "/api/agents/classify", tag = "agents",
    request_body = ClassifyRequest,
    responses((status = 200, description = "Agent classification result", body = ClassifyResponse))
)]
pub async fn classify_agent(
    State(state): State<AppState>,
    Json(body): Json<ClassifyRequest>,
) -> Json<ClassifyResponse> {
    let agents = state.agents.read().await;
    let (agent_id, confidence, reasoning) = classify_prompt(&body.prompt, &agents);
    Json(ClassifyResponse {
        agent: agent_id,
        confidence,
        reasoning,
    })
}

// ---------------------------------------------------------------------------
// Agent CRUD
// ---------------------------------------------------------------------------

#[utoipa::path(post, path = "/api/agents", tag = "agents",
    request_body = WitcherAgent,
    responses((status = 200, description = "Agent created", body = Value))
)]
pub async fn create_agent(
    State(state): State<AppState>,
    Json(agent): Json<WitcherAgent>,
) -> Json<Value> {
    // Validate agent ID: alphanumeric + hyphen + underscore, 1-64 chars
    if agent.id.is_empty()
        || agent.id.len() > 64
        || !agent
            .id
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    {
        return Json(
            json!({ "error": "Invalid agent ID. Use 1-64 alphanumeric/hyphen/underscore characters." }),
        );
    }
    if agent.name.len() > 128 {
        return Json(json!({ "error": "Agent name too long (max 128 chars)" }));
    }

    // Truncate long text fields rather than reject
    let system_prompt: Option<String> = agent
        .system_prompt
        .as_ref()
        .map(|s| s.chars().take(50_000).collect());
    let description: String = agent.description.chars().take(2000).collect();

    if let Err(e) = sqlx::query(
        "INSERT INTO gh_agents (id, name, role, tier, status, description, system_prompt, keywords, temperature) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"
    )
    .bind(&agent.id)
    .bind(&agent.name)
    .bind(&agent.role)
    .bind(&agent.tier)
    .bind(&agent.status)
    .bind(&description)
    .bind(&system_prompt)
    .bind(&agent.keywords)
    .bind(agent.temperature)
    .execute(&state.db)
    .await
    {
        tracing::error!("Failed to create agent '{}': {}", agent.id, e);
        return Json(json!({ "error": "Failed to create agent" }));
    }

    state.refresh_agents().await;
    Json(json!({ "success": true }))
}

#[utoipa::path(post, path = "/api/agents/{id}", tag = "agents",
    params(("id" = String, Path, description = "Agent ID")),
    request_body = WitcherAgent,
    responses((status = 200, description = "Agent updated", body = Value))
)]
pub async fn update_agent(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(agent): Json<WitcherAgent>,
) -> Json<Value> {
    if agent.name.len() > 128 {
        return Json(json!({ "error": "Agent name too long (max 128 chars)" }));
    }

    // Truncate long text fields rather than reject
    let system_prompt: Option<String> = agent
        .system_prompt
        .as_ref()
        .map(|s| s.chars().take(50_000).collect());
    let description: String = agent.description.chars().take(2000).collect();

    if let Err(e) = sqlx::query(
        "UPDATE gh_agents SET name=$1, role=$2, tier=$3, status=$4, description=$5, system_prompt=$6, keywords=$7, temperature=$8, updated_at=NOW() \
         WHERE id=$9"
    )
    .bind(&agent.name)
    .bind(&agent.role)
    .bind(&agent.tier)
    .bind(&agent.status)
    .bind(&description)
    .bind(&system_prompt)
    .bind(&agent.keywords)
    .bind(agent.temperature)
    .bind(id)
    .execute(&state.db)
    .await
    {
        tracing::error!("Failed to update agent: {}", e);
        return Json(json!({ "error": "Failed to update agent" }));
    }

    state.refresh_agents().await;
    Json(json!({ "success": true }))
}

#[utoipa::path(delete, path = "/api/agents/{id}", tag = "agents",
    params(("id" = String, Path, description = "Agent ID")),
    responses((status = 200, description = "Agent deleted", body = Value))
)]
pub async fn delete_agent(
    State(state): State<AppState>,
    axum::extract::ConnectInfo(addr): axum::extract::ConnectInfo<std::net::SocketAddr>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Json<Value> {
    let _ = sqlx::query("DELETE FROM gh_agents WHERE id=$1")
        .bind(&id)
        .execute(&state.db)
        .await;
    state.refresh_agents().await;

    crate::audit::log_audit(
        &state.db,
        "delete_agent",
        json!({ "agent_id": id }),
        Some(&addr.ip().to_string()),
    )
    .await;

    Json(json!({ "success": true }))
}

// ---------------------------------------------------------------------------
// GET /api/agents/delegations â€” A2A delegation monitoring
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct AgentRow {
    id: String,
    agent_id: String,
    caller_agent_id: Option<String>,
    status: String,
    prompt: String,
    result: Option<String>,
    error_message: Option<String>,
    duration_ms: Option<i32>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
    call_depth: i32,
    model_used: Option<String>,
    prompt_tokens: Option<i32>,
    completion_tokens: Option<i32>,
    total_tokens: Option<i32>,
    completed_steps: Option<i32>,
    estimated_steps: Option<i32>,
}

#[utoipa::path(get, path = "/api/agents/delegations", tag = "agents",
    responses((status = 200, description = "Recent agent-to-agent delegations"))
)]
pub async fn list_delegations(
    State(state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let rows: Vec<AgentRow> = sqlx::query_as(
        "SELECT id, agent_id, caller_agent_id, status, prompt, result, error_message, \
         duration_ms, created_at, updated_at, call_depth, model_used, \
         prompt_tokens, completion_tokens, total_tokens, completed_steps, estimated_steps \
         FROM gh_a2a_tasks ORDER BY created_at DESC LIMIT 50",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("list_delegations DB error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Failed to load delegations" })),
        )
    })?;

    let agents = state.agents.read().await;
    let tasks: Vec<Value> = rows.iter().map(|r| {
        let agent_name = agents.iter()
            .find(|a| a.id == r.agent_id)
            .map(|a| a.name.clone())
            .unwrap_or_else(|| r.agent_id.clone());
        let agent_tier = agents.iter()
            .find(|a| a.id == r.agent_id)
            .map(|a| a.tier.clone())
            .unwrap_or_else(|| "executor".to_string());

        json!({
            "id": r.id,
            "agent_name": agent_name,
            "agent_tier": agent_tier,
            "agent_id": r.agent_id,
            "caller_agent_id": r.caller_agent_id,
            "status": r.status,
            "task_prompt": r.prompt,
            "result_preview": r.result.as_ref().map(|s| {
                let chars: String = s.chars().take(200).collect();
                chars
            }),
            "is_error": r.error_message.is_some(),
            "error_message": r.error_message,
            "duration_ms": r.duration_ms,
            "created_at": r.created_at.to_rfc3339(),
            "completed_at": if r.status == "completed" || r.error_message.is_some() { Some(r.updated_at.to_rfc3339()) } else { None },
            "call_depth": r.call_depth,
            "model_used": r.model_used.clone().unwrap_or_else(|| "gemini-2.5-flash".to_string()),
            "prompt_tokens": r.prompt_tokens.unwrap_or(0),
            "completion_tokens": r.completion_tokens.unwrap_or(0),
            "total_tokens": r.total_tokens.unwrap_or(0),
            "completed_steps": r.completed_steps.unwrap_or(0),
            "estimated_steps": r.estimated_steps.unwrap_or(5),
        })
    }).collect();

    // Stats summary
    type StatsRow = (i64, i64, i64, Option<f64>, Option<i64>);
    let stats_row: Option<StatsRow> = sqlx::query_as(
        "SELECT COUNT(*), \
         COUNT(*) FILTER (WHERE status = 'completed'), \
         COUNT(*) FILTER (WHERE error_message IS NOT NULL), \
         AVG(duration_ms)::float8, \
         SUM(total_tokens) \
         FROM gh_a2a_tasks",
    )
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();

    let (total, completed, errors, avg_ms, total_tokens) =
        stats_row.unwrap_or((0, 0, 0, None, None));

    Ok(Json(json!({
        "tasks": tasks,
        "stats": {
            "total": total,
            "completed": completed,
            "errors": errors,
            "avg_duration_ms": avg_ms.map(|v| v as i64),
            "total_tokens": total_tokens.unwrap_or(0),
        }
    })))
}

use axum::response::sse::{Event, Sse};
use std::convert::Infallible;

#[utoipa::path(get, path = "/api/agents/delegations/stream", tag = "agents",
    responses((status = 200, description = "SSE stream for agent-to-agent delegations"))
)]
pub async fn stream_delegations(
    State(state): State<AppState>,
) -> Sse<impl futures_util::Stream<Item = Result<Event, Infallible>>> {
    let mut rx = state.a2a_task_tx.subscribe();
    let state_clone = state.clone();

    let stream = async_stream::stream! {
        // Send initial state immediately
        if let Ok(Json(data)) = list_delegations(State(state_clone.clone())).await {
            yield Ok(Event::default().json_data(data).unwrap_or_default());
        }

        loop {
            match rx.recv().await {
                Ok(_) => {
                    if let Ok(Json(data)) = list_delegations(State(state_clone.clone())).await {
                        yield Ok(Event::default().json_data(data).unwrap_or_default());
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
            }
        }
    };

    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(std::time::Duration::from_secs(15))
            .text("heartbeat"),
    )
}

// ---------------------------------------------------------------------------
// Agent Profiles CRUD
// ---------------------------------------------------------------------------

#[utoipa::path(get, path = "/api/agents/profiles", tag = "agents",
    responses((status = 200, description = "List of agent profiles", body = Value))
)]
pub async fn list_profiles(State(state): State<AppState>) -> Json<Value> {
    let profiles = sqlx::query_as::<_, AgentProfile>(
        "SELECT id, name, system_prompt, created_at FROM agent_profiles ORDER BY created_at DESC",
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();
    Json(json!({ "profiles": profiles }))
}

#[utoipa::path(post, path = "/api/agents/profiles", tag = "agents",
    request_body = CreateAgentProfile,
    responses((status = 200, description = "Agent profile created", body = Value))
)]
pub async fn create_profile(
    State(state): State<AppState>,
    Json(payload): Json<CreateAgentProfile>,
) -> Json<Value> {
    let id = uuid::Uuid::new_v4();
    let _ = sqlx::query("INSERT INTO agent_profiles (id, name, system_prompt) VALUES ($1, $2, $3)")
        .bind(id)
        .bind(&payload.name)
        .bind(&payload.system_prompt)
        .execute(&state.db)
        .await;
    Json(json!({ "success": true, "id": id }))
}
