// GeminiHydra v15 — Vercel OAuth
// Implementation migrated to jaskier-oauth shared crate.
// AppState implements HasVercelOAuthState in state.rs.

pub use jaskier_oauth::vercel::{
    HasVercelOAuthState, VercelCallbackRequest,
    get_vercel_access_token, vercel_auth_callback, vercel_auth_login,
    vercel_auth_logout, vercel_auth_status,
};
