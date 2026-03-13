// ---------------------------------------------------------------------------
// tool_defs.rs — Gemini tool definitions (rendered from shared catalogue)
//
// Static tools are computed once via AppState OnceLock.
// Byte-identical tools JSON across all requests enables Gemini implicit caching.
// ---------------------------------------------------------------------------

use serde_json::Value;

use jaskier_ai_modules::tool_defs as shared;

/// Build the static (non-MCP) tool definitions in Gemini format.
/// Result is cached in `state.tool_defs_cache` (OnceLock — computed once).
pub fn build_tools(state: &crate::state::AppState) -> Value {
    state.tool_defs_cache.get_or_init(|| {
        // GeminiHydra supports all shared tools.
        let tools = shared::all_tools();
        shared::to_gemini_json(&tools)
    }).clone()
}

/// Build tools including dynamically discovered MCP tools.
/// Native tools are cached (OnceLock), MCP tools merged at request time.
/// MCP tools are placed FIRST — they are preferred over native equivalents.
pub async fn build_tools_with_mcp(state: &crate::state::AppState) -> serde_json::Value {
    let native = build_tools(state);
    let mcp_decls = state.mcp_client.build_gemini_tool_declarations().await;

    if mcp_decls.is_empty() {
        return native;
    }

    // MCP tools go FIRST — position advantage for model tool selection
    let mut result = native.clone();
    if let Some(arr) = result
        .get_mut(0)
        .and_then(|v| v.get_mut("function_declarations"))
        .and_then(|v| v.as_array_mut())
    {
        let native_tools: Vec<serde_json::Value> = std::mem::take(arr);
        arr.extend(mcp_decls);
        arr.extend(native_tools);
    }
    result
}
