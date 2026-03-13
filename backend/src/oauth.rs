// GeminiHydra v15 — Google OAuth PKCE + API Key management
// Implementation migrated to jaskier-oauth shared crate.
// This module re-exports everything from the shared crate for backward compatibility.
// AppState implements HasGoogleOAuthState in state.rs.

// ── Encryption utilities ──────────────────────────────────────────────────────
pub use jaskier_oauth::crypto::{decrypt_token, encrypt_token, is_encryption_configured};

// ── PKCE utilities ────────────────────────────────────────────────────────────
pub use jaskier_oauth::pkce::{
    OAUTH_STATE_TTL, OAuthPkceState, html_escape, random_base64url, sha256_base64url,
};

// ── Google OAuth handlers + credential resolution ─────────────────────────────
pub use jaskier_oauth::google::{
    GoogleRedirectParams, SaveApiKeyRequest,
    apply_google_auth, auth_login, auth_logout, auth_status, delete_api_key,
    get_google_api_key_credential, get_google_credential, google_redirect,
    mark_oauth_gemini_invalid, mark_oauth_gemini_valid, save_api_key,
};
