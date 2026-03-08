// ---------------------------------------------------------------------------
// handlers/agents.rs — Agent CRUD + classification endpoints
// ---------------------------------------------------------------------------

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use serde_json::{Value, json};

use crate::models::{ClassifyRequest, ClassifyResponse, WitcherAgent};
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
    // #6 — Cache agent list for 60 seconds
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
    let _ = sqlx::query(
        "INSERT INTO gh_agents (id, name, role, tier, status, description, system_prompt, keywords, temperature) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"
    )
    .bind(&agent.id)
    .bind(&agent.name)
    .bind(&agent.role)
    .bind(&agent.tier)
    .bind(&agent.status)
    .bind(&agent.description)
    .bind(&agent.system_prompt)
    .bind(&agent.keywords)
    .bind(agent.temperature)
    .execute(&state.db)
    .await;

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
    let _ = sqlx::query(
        "UPDATE gh_agents SET name=$1, role=$2, tier=$3, status=$4, description=$5, system_prompt=$6, keywords=$7, temperature=$8, updated_at=NOW() \
         WHERE id=$9"
    )
    .bind(&agent.name)
    .bind(&agent.role)
    .bind(&agent.tier)
    .bind(&agent.status)
    .bind(&agent.description)
    .bind(&agent.system_prompt)
    .bind(&agent.keywords)
    .bind(agent.temperature)
    .bind(id)
    .execute(&state.db)
    .await;

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
// GET /api/agents/delegations — A2A delegation monitoring
// ---------------------------------------------------------------------------

#[utoipa::path(get, path = "/api/agents/delegations", tag = "agents",
    responses((status = 200, description = "Recent agent-to-agent delegations"))
)]
pub async fn list_delegations(
    State(state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let rows: Vec<(
        String,        // id
        String,        // agent_id
        Option<String>,// caller_agent_id
        String,        // status
        String,        // prompt
        Option<String>,// result
        Option<String>,// error_message
        Option<i32>,   // duration_ms
        chrono::DateTime<chrono::Utc>, // created_at
        chrono::DateTime<chrono::Utc>, // updated_at
    )> = sqlx::query_as(
        "SELECT id, agent_id, caller_agent_id, status, prompt, result, error_message, \
         duration_ms, created_at, updated_at \
         FROM gh_a2a_tasks ORDER BY created_at DESC LIMIT 50"
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(json!({ "error": format!("DB error: {}", e) })),
    ))?;

    let agents = state.agents.read().await;
    let tasks: Vec<Value> = rows.iter().map(|r| {
        let agent_name = agents.iter()
            .find(|a| a.id == r.1)
            .map(|a| a.name.clone())
            .unwrap_or_else(|| r.1.clone());
        let agent_tier = agents.iter()
            .find(|a| a.id == r.1)
            .map(|a| a.tier.clone())
            .unwrap_or_else(|| "executor".to_string());

        json!({
            "id": r.0,
            "agent_name": agent_name,
            "agent_tier": agent_tier,
            "agent_id": r.1,
            "caller_agent_id": r.2,
            "status": r.3,
            "task_prompt": r.4,
            "result_preview": r.5.as_ref().map(|s| {
                let chars: String = s.chars().take(200).collect();
                chars
            }),
            "is_error": r.6.is_some(),
            "error_message": r.6,
            "duration_ms": r.7,
            "created_at": r.8.to_rfc3339(),
            "completed_at": if r.3 == "completed" || r.6.is_some() { Some(r.9.to_rfc3339()) } else { None },
        })
    }).collect();

    // Stats summary
    let stats_row: Option<(i64, i64, i64, Option<f64>)> = sqlx::query_as(
        "SELECT COUNT(*), \
         COUNT(*) FILTER (WHERE status = 'completed'), \
         COUNT(*) FILTER (WHERE error_message IS NOT NULL), \
         AVG(duration_ms)::float8 \
         FROM gh_a2a_tasks"
    )
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();

    let (total, completed, errors, avg_ms) = stats_row.unwrap_or((0, 0, 0, None));

    Ok(Json(json!({
        "tasks": tasks,
        "stats": {
            "total": total,
            "completed": completed,
            "errors": errors,
            "avg_duration_ms": avg_ms.map(|v| v as i64),
        }
    })))
}
