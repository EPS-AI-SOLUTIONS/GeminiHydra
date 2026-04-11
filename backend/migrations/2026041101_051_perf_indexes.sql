-- migration: composite performance indexes for gh_agent_usage analytics queries
-- Adds (created_at, agent_id) and (created_at, model) composite indexes to support
-- time-range analytics queries that also filter or group by agent_id or model.
-- The existing single-column indexes on agent_id and created_at separately do not
-- cover composite WHERE/GROUP BY patterns efficiently.

CREATE INDEX IF NOT EXISTS idx_gh_agent_usage_created_agent
    ON gh_agent_usage (created_at, agent_id);

CREATE INDEX IF NOT EXISTS idx_gh_agent_usage_created_model
    ON gh_agent_usage (created_at, model);
