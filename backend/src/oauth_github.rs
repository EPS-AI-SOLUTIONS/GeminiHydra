// GeminiHydra v15 — GitHub OAuth
// Implementation migrated to jaskier-oauth shared crate.
// AppState implements HasGitHubOAuthState in state.rs.

pub use jaskier_oauth::github::{
    GitHubCallbackRequest, HasGitHubOAuthState,
    get_github_access_token, github_auth_callback, github_auth_login,
    github_auth_logout, github_auth_status,
};
