use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Event types emitted by Claude CLI
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClaudeStreamEvent {
    /// System message
    System { message: String },

    /// Assistant text output
    Assistant {
        message: String,
        #[serde(default)]
        session_id: Option<String>,
    },

    /// Tool use request
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },

    /// Tool result
    ToolResult {
        id: String,
        #[serde(default)]
        output: Option<String>,
        #[serde(default)]
        is_error: bool,
    },

    /// Permission/approval request
    PermissionRequest {
        tool: String,
        action: String,
        details: serde_json::Value,
    },

    /// Result/completion
    Result {
        session_id: String,
        #[serde(default)]
        cost_usd: Option<f64>,
        #[serde(default)]
        duration_ms: Option<u64>,
    },

    /// Error
    Error { message: String },
}

/// Approval type for different tools
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ApprovalType {
    BashCommand {
        command: String,
        #[serde(default)]
        description: Option<String>,
    },
    FileWrite {
        path: String,
    },
    FileEdit {
        path: String,
        #[serde(default)]
        changes: Option<String>,
    },
    FileRead {
        path: String,
    },
    WebFetch {
        url: String,
    },
    McpTool {
        server: String,
        tool: String,
        #[serde(default)]
        input: Option<serde_json::Value>,
    },
}

/// Event sent to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeEvent {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub event_type: String,
    pub data: serde_json::Value,
    pub requires_approval: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval_type: Option<ApprovalType>,
}

impl ClaudeEvent {
    pub fn new(event_type: &str, data: serde_json::Value) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            event_type: event_type.to_string(),
            data,
            requires_approval: false,
            approval_type: None,
        }
    }

    pub fn with_approval(mut self, approval_type: ApprovalType) -> Self {
        self.requires_approval = true;
        self.approval_type = Some(approval_type);
        self
    }
}

/// History entry for approved/denied actions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalHistoryEntry {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub approval_type: ApprovalType,
    pub action: ApprovalAction,
    pub auto_approved: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub matched_rule: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ApprovalAction {
    Approved,
    Denied,
}

/// Session status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionStatus {
    pub is_active: bool,
    pub session_id: Option<String>,
    pub working_dir: Option<String>,
    pub started_at: Option<DateTime<Utc>>,
    pub pending_approval: bool,
    pub auto_approve_all: bool,
    pub approved_count: u32,
    pub denied_count: u32,
    pub auto_approved_count: u32,
}

impl Default for SessionStatus {
    fn default() -> Self {
        Self {
            is_active: false,
            session_id: None,
            working_dir: None,
            started_at: None,
            pending_approval: false,
            auto_approve_all: false,
            approved_count: 0,
            denied_count: 0,
            auto_approved_count: 0,
        }
    }
}
