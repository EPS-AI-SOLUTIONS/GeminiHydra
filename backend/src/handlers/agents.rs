// ---------------------------------------------------------------------------
// handlers/agents.rs — Agent CRUD + classification (delegated to jaskier-core)
// Re-exports all public items so existing router code compiles unchanged.
// HasAgentState is implemented for AppState in state.rs.
// ---------------------------------------------------------------------------

#[allow(unused_imports)]
pub use jaskier_core::handlers::agents::{
    classify_agent, create_agent, create_profile, delete_agent, list_agents, list_delegations,
    list_profiles, stream_delegations, update_agent, HasAgentState,
};
