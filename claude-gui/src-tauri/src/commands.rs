use tauri::{command, Emitter, State, Window};
use tokio::sync::mpsc;

use crate::claude::auto_approve::ApprovalRule;
use crate::claude::state::AppState;
use crate::claude::types::{ApprovalAction, ApprovalHistoryEntry, ClaudeEvent, SessionStatus};

/// Start a new Claude CLI session
#[command]
pub async fn start_claude_session(
    state: State<'_, AppState>,
    window: Window,
    working_dir: String,
    cli_path: String,
    initial_prompt: Option<String>,
) -> Result<String, String> {
    // Create event channel
    let (event_tx, mut event_rx) = mpsc::channel::<ClaudeEvent>(100);

    // Start session
    let session_id = state.start_session(&working_dir, &cli_path, initial_prompt, event_tx).await?;

    // Clone state for the spawned task
    let state_bridge = state.bridge.clone();
    let state_auto_approve = state.auto_approve.clone();
    let state_pending = state.pending_approval.clone();
    let state_history = state.history.clone();
    let state_stats = state.stats.clone();

    // Spawn event forwarding task
    let window_clone = window.clone();
    tokio::spawn(async move {
        while let Some(event) = event_rx.recv().await {
            // Check if requires approval
            if event.requires_approval {
                if let Some(ref approval_type) = event.approval_type {
                    // Check auto-approve
                    let matched_rule = {
                        let engine = state_auto_approve.read().await;
                        engine.should_auto_approve(approval_type)
                    };

                    if let Some(rule_id) = matched_rule {
                        // Auto-approve
                        {
                            let bridge = state_bridge.read().await;
                            if let Err(e) = bridge.approve().await {
                                tracing::error!("Failed to auto-approve: {}", e);
                            }
                        }

                        // Add to history
                        let entry = ApprovalHistoryEntry {
                            id: uuid::Uuid::new_v4().to_string(),
                            timestamp: chrono::Utc::now(),
                            approval_type: approval_type.clone(),
                            action: ApprovalAction::Approved,
                            auto_approved: true,
                            matched_rule: Some(rule_id.clone()),
                        };

                        {
                            let mut history = state_history.write().await;
                            history.push(entry);
                            if history.len() > 100 {
                                history.remove(0);
                            }
                        }

                        {
                            let mut stats = state_stats.write().await;
                            stats.auto_approved_count += 1;
                        }

                        // Emit auto-approved event
                        let _ = window_clone.emit("claude-auto-approved", &serde_json::json!({
                            "event": event,
                            "matched_rule": rule_id,
                        }));

                        continue;
                    }
                }

                // Store pending approval
                *state_pending.write().await = Some(event.clone());

                // Emit approval required
                let _ = window_clone.emit("claude-approval-required", &event);
            } else {
                // Emit regular event
                let _ = window_clone.emit("claude-event", &event);
            }
        }

        // Session ended
        let _ = window_clone.emit("claude-session-ended", &());
    });

    Ok(session_id)
}

/// Stop the current Claude CLI session
#[command]
pub async fn stop_claude_session(state: State<'_, AppState>) -> Result<(), String> {
    state.stop_session().await
}

/// Send input to Claude CLI
#[command]
pub async fn send_input(state: State<'_, AppState>, input: String) -> Result<(), String> {
    state.send_input(&input).await
}

/// Approve pending action
#[command]
pub async fn approve_action(state: State<'_, AppState>) -> Result<(), String> {
    let approval_type = state.approve().await?;

    if let Some(at) = approval_type {
        state.add_history_entry(at, ApprovalAction::Approved, false, None).await;
    }

    Ok(())
}

/// Deny pending action
#[command]
pub async fn deny_action(state: State<'_, AppState>) -> Result<(), String> {
    let approval_type = state.deny().await?;

    if let Some(at) = approval_type {
        state.add_history_entry(at, ApprovalAction::Denied, false, None).await;
    }

    Ok(())
}

/// Get approval rules
#[command]
pub async fn get_approval_rules(state: State<'_, AppState>) -> Result<Vec<ApprovalRule>, String> {
    Ok(state.get_rules().await)
}

/// Update approval rules
#[command]
pub async fn update_approval_rules(state: State<'_, AppState>, rules: Vec<ApprovalRule>) -> Result<(), String> {
    state.set_rules(rules).await;
    Ok(())
}

/// Toggle auto-approve all
#[command]
pub async fn toggle_auto_approve_all(state: State<'_, AppState>, enabled: bool) -> Result<(), String> {
    state.set_auto_approve_all(enabled).await;
    Ok(())
}

/// Get session status
#[command]
pub async fn get_session_status(state: State<'_, AppState>) -> Result<SessionStatus, String> {
    Ok(state.get_status().await)
}

/// Get approval history
#[command]
pub async fn get_approval_history(state: State<'_, AppState>) -> Result<Vec<ApprovalHistoryEntry>, String> {
    Ok(state.get_history().await)
}

/// Clear approval history
#[command]
pub async fn clear_approval_history(state: State<'_, AppState>) -> Result<(), String> {
    state.clear_history().await;
    Ok(())
}
