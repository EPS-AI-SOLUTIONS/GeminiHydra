use chrono::{DateTime, Utc};
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};

use super::auto_approve::{ApprovalRule, AutoApproveEngine};
use super::bridge::ClaudeBridge;
use super::types::{ApprovalAction, ApprovalHistoryEntry, ApprovalType, ClaudeEvent, SessionStatus};

/// Application state managed by Tauri
pub struct AppState {
    pub bridge: Arc<RwLock<ClaudeBridge>>,
    pub auto_approve: Arc<RwLock<AutoApproveEngine>>,
    pub event_tx: Arc<RwLock<Option<mpsc::Sender<ClaudeEvent>>>>,
    pub pending_approval: Arc<RwLock<Option<ClaudeEvent>>>,
    pub history: Arc<RwLock<Vec<ApprovalHistoryEntry>>>,
    pub started_at: Arc<RwLock<Option<DateTime<Utc>>>>,
    pub stats: Arc<RwLock<SessionStats>>,
}

#[derive(Default, Clone)]
pub struct SessionStats {
    pub approved_count: u32,
    pub denied_count: u32,
    pub auto_approved_count: u32,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            bridge: Arc::new(RwLock::new(ClaudeBridge::new())),
            auto_approve: Arc::new(RwLock::new(AutoApproveEngine::new())),
            event_tx: Arc::new(RwLock::new(None)),
            pending_approval: Arc::new(RwLock::new(None)),
            history: Arc::new(RwLock::new(Vec::new())),
            started_at: Arc::new(RwLock::new(None)),
            stats: Arc::new(RwLock::new(SessionStats::default())),
        }
    }

    pub async fn get_status(&self) -> SessionStatus {
        let bridge = self.bridge.read().await;
        let auto_approve = self.auto_approve.read().await;
        let pending = self.pending_approval.read().await;
        let started_at = self.started_at.read().await;
        let stats = self.stats.read().await;

        SessionStatus {
            is_active: bridge.is_active(),
            session_id: bridge.session_id().map(String::from),
            working_dir: if bridge.is_active() {
                Some(bridge.working_dir().to_string())
            } else {
                None
            },
            started_at: *started_at,
            pending_approval: pending.is_some(),
            auto_approve_all: auto_approve.is_auto_approve_all(),
            approved_count: stats.approved_count,
            denied_count: stats.denied_count,
            auto_approved_count: stats.auto_approved_count,
        }
    }

    pub async fn add_history_entry(
        &self,
        approval_type: ApprovalType,
        action: ApprovalAction,
        auto_approved: bool,
        matched_rule: Option<String>,
    ) {
        let entry = ApprovalHistoryEntry {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            approval_type,
            action: action.clone(),
            auto_approved,
            matched_rule,
        };

        // Update stats
        {
            let mut stats = self.stats.write().await;
            match action {
                ApprovalAction::Approved => {
                    if auto_approved {
                        stats.auto_approved_count += 1;
                    } else {
                        stats.approved_count += 1;
                    }
                }
                ApprovalAction::Denied => {
                    stats.denied_count += 1;
                }
            }
        }

        // Add to history (keep last 100)
        {
            let mut history = self.history.write().await;
            history.push(entry);
            if history.len() > 100 {
                history.remove(0);
            }
        }
    }

    pub async fn get_history(&self) -> Vec<ApprovalHistoryEntry> {
        self.history.read().await.clone()
    }

    pub async fn clear_history(&self) {
        self.history.write().await.clear();
        let mut stats = self.stats.write().await;
        stats.approved_count = 0;
        stats.denied_count = 0;
        stats.auto_approved_count = 0;
    }

    pub async fn get_rules(&self) -> Vec<ApprovalRule> {
        self.auto_approve.read().await.get_rules().to_vec()
    }

    pub async fn set_rules(&self, rules: Vec<ApprovalRule>) {
        self.auto_approve.write().await.set_rules(rules);
    }

    pub async fn set_auto_approve_all(&self, enabled: bool) {
        self.auto_approve.write().await.set_auto_approve_all(enabled);
    }

    pub async fn reset_session(&self) {
        *self.started_at.write().await = None;
        *self.pending_approval.write().await = None;
    }

    // High-level async operations

    pub async fn start_session(
        &self,
        working_dir: &str,
        cli_path: &str,
        initial_prompt: Option<String>,
        event_tx: mpsc::Sender<ClaudeEvent>,
    ) -> Result<String, String> {
        *self.event_tx.write().await = Some(event_tx.clone());
        *self.started_at.write().await = Some(Utc::now());

        let mut bridge = self.bridge.write().await;
        bridge.spawn(working_dir, cli_path, initial_prompt, event_tx).await?;

        Ok(bridge.session_id().unwrap_or_default().to_string())
    }

    pub async fn stop_session(&self) -> Result<(), String> {
        let mut bridge = self.bridge.write().await;
        bridge.stop().await?;
        drop(bridge);

        self.reset_session().await;
        Ok(())
    }

    pub async fn send_input(&self, input: &str) -> Result<(), String> {
        let bridge = self.bridge.read().await;
        bridge.write(input).await
    }

    pub async fn approve(&self) -> Result<Option<ApprovalType>, String> {
        let pending = self.pending_approval.write().await.take();

        if let Some(event) = pending {
            let bridge = self.bridge.read().await;
            bridge.approve().await?;
            drop(bridge);

            Ok(event.approval_type)
        } else {
            Err("No pending approval".to_string())
        }
    }

    pub async fn deny(&self) -> Result<Option<ApprovalType>, String> {
        let pending = self.pending_approval.write().await.take();

        if let Some(event) = pending {
            let bridge = self.bridge.read().await;
            bridge.deny().await?;
            drop(bridge);

            Ok(event.approval_type)
        } else {
            Err("No pending approval".to_string())
        }
    }

    #[allow(dead_code)]
    pub async fn check_auto_approve(&self, approval_type: &ApprovalType) -> Option<String> {
        let engine = self.auto_approve.read().await;
        engine.should_auto_approve(approval_type)
    }

    #[allow(dead_code)]
    pub async fn set_pending(&self, event: ClaudeEvent) {
        *self.pending_approval.write().await = Some(event);
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
