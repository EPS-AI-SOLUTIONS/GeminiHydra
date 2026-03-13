// ---------------------------------------------------------------------------
// classify.rs — Agent classification logic (re-exported from jaskier-ai-modules)
// ---------------------------------------------------------------------------
//
// All classify logic (pure helpers + classify_with_gemini) now lives in
// jaskier-ai-modules::classify. This stub re-exports everything so that
// `crate::classify::*` callers continue to resolve.

pub use jaskier_ai_modules::classify::{
    classify_agent_score, classify_prompt, classify_with_gemini, keyword_match, strip_diacritics,
};
