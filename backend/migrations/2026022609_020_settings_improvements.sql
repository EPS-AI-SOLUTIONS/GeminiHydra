-- #46: Add topP to settings
ALTER TABLE gh_settings ADD COLUMN IF NOT EXISTS top_p DOUBLE PRECISION NOT NULL DEFAULT 0.95;

-- #47: Add response_style to settings (valid: 'concise', 'balanced', 'detailed', 'technical')
ALTER TABLE gh_settings ADD COLUMN IF NOT EXISTS response_style TEXT NOT NULL DEFAULT 'balanced';

-- #48: Per-agent temperature override (NULL = use global setting)
ALTER TABLE gh_agents ADD COLUMN IF NOT EXISTS temperature DOUBLE PRECISION DEFAULT NULL;

-- #49: Max tool calls per request setting
ALTER TABLE gh_settings ADD COLUMN IF NOT EXISTS max_iterations INTEGER NOT NULL DEFAULT 10;

-- #50a: Ensure gh_ratings table exists (needed by view below)
CREATE TABLE IF NOT EXISTS gh_ratings (
    id BIGSERIAL PRIMARY KEY,
    message_id UUID NOT NULL,
    session_id UUID NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    feedback TEXT,
    agent_id TEXT,
    model TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- #50b: Agent rating stats view (used by feedback loop)
CREATE OR REPLACE VIEW gh_agent_rating_stats AS
SELECT
    m.agent as agent_id,
    COUNT(*) as total_ratings,
    ROUND(AVG(r.rating)::numeric, 2) as avg_rating,
    COUNT(*) FILTER (WHERE r.rating <= 2) as low_ratings
FROM gh_ratings r
JOIN gh_chat_messages m ON m.id = r.message_id
WHERE m.agent IS NOT NULL
  AND r.created_at > NOW() - INTERVAL '7 days'
GROUP BY m.agent;
