// ---------------------------------------------------------------------------
// prompt.rs — System prompt building (delegated to jaskier-core)
// ---------------------------------------------------------------------------
//
// Re-exports for backward compatibility with `use crate::prompt::*` callers.
// ---------------------------------------------------------------------------

pub use jaskier_core::prompt::{
    build_system_prompt, build_thinking_config, fetch_knowledge_context,
};
