// ---------------------------------------------------------------------------
// prompt.rs — System prompt building now lives in jaskier-core.
// This stub re-exports everything so existing `use crate::prompt::*` code
// keeps compiling unchanged.
// ---------------------------------------------------------------------------

pub use jaskier_core::prompt::{build_system_prompt, build_thinking_config, fetch_knowledge_context};
