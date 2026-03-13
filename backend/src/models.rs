// ---------------------------------------------------------------------------
// models.rs — All protocol types now live in jaskier-core.
// This stub re-exports everything so existing `use crate::models::*` code
// keeps compiling unchanged.
// ---------------------------------------------------------------------------

// ── Session/settings types from jaskier-core sessions module ──────────────
pub use jaskier_core::sessions::models::{
    AddPromptRequest, AppSettings, ChatMessage, ChatMessageRow, CreateSessionRequest,
    KnowledgeEdgeRow, KnowledgeNodeRow, MemoryRow, PromptHistoryRow, RatingRequest,
    RatingResponse, Session, SessionRow, SessionSummary, SessionSummaryRow, SettingsRow,
    UnlockAgentResponse, UpdateSessionRequest, UpdateWorkingDirectoryRequest,
};

// ── Health types from jaskier-core handlers::system ───────────────────────
pub use jaskier_core::handlers::system::{
    DetailedHealthResponse, HealthResponse, ProviderInfo, SystemStats,
};

// ── Shared protocol types from jaskier-core models module ─────────────────
pub use jaskier_core::models::{
    AgentMessage, AgentProfile, ClassifyRequest, ClassifyResponse, CreateAgentProfile,
    ExecutePlan, ExecuteRequest, ExecuteResponse, FileEntryResponse, FileListRequest,
    FileListResponse, FileReadRequest, FileReadResponse, GeminiModelInfo, GeminiModelsResponse,
    GeminiStreamRequest, ParallelAgentStatus, WitcherAgent, WsClientMessage, WsServerMessage,
};
