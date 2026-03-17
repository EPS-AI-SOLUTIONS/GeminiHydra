// Jaskier Shared Pattern — audit (re-export module)
// Delegates to jaskier_core::audit with app-specific table name `gh_audit_log`.

use serde_json::Value;
use sqlx::PgPool;

pub use jaskier_core::audit::extract_ip;

/// Insert an audit log entry into `gh_audit_log`.
pub async fn log_audit(pool: &PgPool, action: &str, details: Value, ip: Option<&str>) {
    jaskier_core::audit::log_audit(pool, "gh_audit_log", action, details, ip).await;
}
