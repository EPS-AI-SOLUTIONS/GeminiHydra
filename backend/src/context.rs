// ---------------------------------------------------------------------------
// context.rs — Execution context preparation (delegated to jaskier-core)
// ---------------------------------------------------------------------------
//
// All logic now lives in jaskier_core::context::prepare_execution.
// This stub re-exports types so existing `use crate::context::*` callers
// continue to resolve. The HasExecutionContext trait is impl'd in state.rs.
// ---------------------------------------------------------------------------

pub use jaskier_core::context::{
    ExecuteContext, HasExecutionContext, ToolOutput, is_retryable_status, prepare_execution,
    tier_token_budget,
};
