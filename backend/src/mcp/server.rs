// Jaskier Shared Pattern -- mcp/server (re-export stub)
//! MCP Server — re-exports the shared generic handler from jaskier-core.
//!
//! The full implementation lives in `jaskier_core::mcp::server`.
//! App-specific behavior is provided via `HasMcpServerState` trait impl
//! on `AppState` (see `state.rs`).

pub use jaskier_core::mcp::server::*;
