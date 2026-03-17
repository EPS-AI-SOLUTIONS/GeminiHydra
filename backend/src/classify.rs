// ---------------------------------------------------------------------------
// classify.rs — Agent classification logic (delegated to jaskier-ai-modules)
// ---------------------------------------------------------------------------
//
// All classify logic (pure helpers + classify_with_gemini) lives in
// jaskier_ai_modules::classify. Re-exports for `crate::classify::*` callers.
// ---------------------------------------------------------------------------

pub use jaskier_ai_modules::classify::{
    classify_agent_score, classify_prompt, classify_with_gemini, keyword_match, strip_diacritics,
};
