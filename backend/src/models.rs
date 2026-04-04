// ---------------------------------------------------------------------------
// models.rs — Protocol types (delegated to jaskier-core)
// ---------------------------------------------------------------------------
//
// All protocol types live in jaskier-core. Re-exports for backward
// compatibility with `use crate::models::*` callers.
// ---------------------------------------------------------------------------

// ── Session/settings types from jaskier-core sessions module ──────────────
pub use jaskier_core::sessions::models::{
    AddPromptRequest, AppSettings, ChatMessage, ChatMessageRow, CreateSessionRequest,
    KnowledgeEdgeRow, KnowledgeNodeRow, MemoryRow, PromptHistoryRow, RatingRequest, RatingResponse,
    Session, SessionRow, SessionSummary, SessionSummaryRow, SettingsRow, UnlockAgentResponse,
    UpdateSessionRequest, UpdateWorkingDirectoryRequest,
};

// ── Health types from jaskier-core handlers::system ───────────────────────
pub use jaskier_core::handlers::system::{
    DetailedHealthResponse, HealthResponse, ProviderInfo, SystemStats,
};

// ── Shared protocol types from jaskier-core models module ─────────────────
pub use jaskier_core::models::{
    AddMessageRequest, AgentMessage, AgentProfile, ApiKeyRequest, ChatRequest, ChatRequestMessage,
    ChatResponse, ClassifyRequest, ClassifyResponse, CreateAgentProfile, ExecutePlan,
    ExecuteRequest, ExecuteResponse, FileEntryResponse, FileListRequest, FileListResponse,
    FileReadRequest, FileReadResponse, GeminiModelInfo, GeminiModelsResponse, GeminiStreamRequest,
    HistoryEntry, MessageRow, MetricItem, NetworkMetric, ParallelAgentStatus,
    SystemMetricsResponse, ToolDefinition, ToolInteractionInfo, ToolInteractionRow, UsageInfo,
    WitcherAgent, WsClientMessage, WsServerMessage,
};
