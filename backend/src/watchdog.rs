// GeminiHydra v15 — Background watchdog
// Core watchdog logic (DB ping, model cache refresh, browser proxy monitoring)
// is provided by the shared `jaskier-browser` crate.
// This module adds a GeminiHydra-specific Google API reachability check.

pub use jaskier_browser::watchdog::HasWatchdogState;

use std::time::Duration;

use crate::state::AppState;

const CHECK_INTERVAL: Duration = Duration::from_secs(60);

/// Spawn the shared watchdog + an additional Google API health check task.
pub fn spawn(state: AppState) -> tokio::task::JoinHandle<()> {
    // Spawn shared watchdog (DB ping, model cache refresh, browser proxy monitoring)
    let shared_handle = jaskier_browser::watchdog::spawn(state.clone());

    // Spawn GeminiHydra-specific Google API check on the same interval
    tokio::spawn(async move {
        tracing::info!(
            "watchdog: Google API health check started (interval={}s)",
            CHECK_INTERVAL.as_secs()
        );

        loop {
            tokio::time::sleep(CHECK_INTERVAL).await;
            let api_ok = check_google_api(&state).await;
            if !api_ok {
                tracing::warn!("watchdog: Google API check failed");
            }
        }
    });

    shared_handle
}

/// Check Google Generative Language API reachability.
/// Uses a lightweight HEAD request to generativelanguage.googleapis.com (no tokens consumed).
/// Skips if no credential is available (env var — Vault sets these).
async fn check_google_api(state: &AppState) -> bool {
    // B13: credentials come from env vars (Vault sets these)
    let has_env_key = std::env::var("GOOGLE_API_KEY")
        .ok()
        .filter(|k| !k.is_empty())
        .is_some()
        || std::env::var("GEMINI_API_KEY")
            .ok()
            .filter(|k| !k.is_empty())
            .is_some();

    if !has_env_key {
        // No credential — skip check (not an error)
        tracing::debug!(
            "watchdog: no Google API credential configured, skipping reachability check"
        );
        return true;
    }

    let result = tokio::time::timeout(
        Duration::from_secs(5),
        state
            .base
            .client
            .head("https://generativelanguage.googleapis.com/v1beta/models")
            .send(),
    )
    .await;

    match result {
        Ok(Ok(resp)) => {
            // Any HTTP response (even 401/403) means the host is reachable
            let status = resp.status().as_u16();
            if status >= 500 {
                tracing::warn!("watchdog: Google API returned server error {}", status);
                false
            } else {
                tracing::debug!("watchdog: Google API reachable (HTTP {})", status);
                true
            }
        }
        Ok(Err(e)) => {
            tracing::error!("watchdog: Google API unreachable: {}", e);
            false
        }
        Err(_) => {
            tracing::error!("watchdog: Google API check timed out after 5s");
            false
        }
    }
}
