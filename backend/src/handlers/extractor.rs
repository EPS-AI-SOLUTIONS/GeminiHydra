//! Axum extractor for GeminiHydra JWT authentication.
//!
//! Uses `jaskier-auth` shared auth system exclusively.
//!
//! JWTs are looked up in this order:
//! 1. `Authorization: Bearer <token>` header
//! 2. `jaskier_access_token` cookie (jaskier-auth)
//! 3. `?token=` query param (SSE EventSource fallback)

use axum::{
    extract::FromRequestParts,
    http::{StatusCode, request::Parts},
};
use tracing::{debug, warn};

use crate::state::AppState;

/// Authenticated user extracted from a valid JWT token (jaskier-auth).
pub struct RequireAuth {
    pub email: String,
    pub name: Option<String>,
}

impl FromRequestParts<AppState> for RequireAuth {
    type Rejection = (StatusCode, String);

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let jwt_secret = state.base.auth_secret.as_deref().ok_or_else(|| {
            warn!("AUTH_SECRET not configured -- rejecting authenticated request");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Server authentication not configured".to_string(),
            )
        })?;

        let token = extract_token(parts).ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                "Missing authentication token".to_string(),
            )
        })?;

        let user = jaskier_auth::validate_token(&token, jwt_secret.as_bytes()).map_err(|e| {
            warn!(error = %e, "JWT token validation failed");
            (
                StatusCode::UNAUTHORIZED,
                "Invalid or expired authentication token".to_string(),
            )
        })?;

        debug!(email = %user.email, "Authenticated via jaskier-auth");
        Ok(RequireAuth {
            email: user.email,
            name: user.name,
        })
    }
}

/// Extract the raw JWT string from the request (header, cookie, or query param).
fn extract_token(parts: &Parts) -> Option<String> {
    // 1. Try Authorization: Bearer <token> header
    if let Some(auth_header) = parts
        .headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        && let Some(token) = auth_header.strip_prefix("Bearer ")
    {
        return Some(token.to_string());
    }

    // 2. Try jaskier_access_token cookie
    if let Some(cookie_header) = parts.headers.get("cookie").and_then(|v| v.to_str().ok()) {
        for pair in cookie_header.split(';') {
            let pair = pair.trim();
            if let Some(value) = pair.strip_prefix("jaskier_access_token=")
                && !value.is_empty()
            {
                return Some(value.to_string());
            }
        }
    }

    // 3. Fallback: ?token= query param for SSE
    if let Some(query) = parts.uri.query() {
        for param in query.split('&') {
            if let Some((k, v)) = param.split_once('=')
                && k == "token"
            {
                return Some(v.to_string());
            }
        }
    }

    None
}
