-- MCP Permissions mapping agents to allowed MCP servers
CREATE TABLE IF NOT EXISTS ch_mcp_permissions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    agent_id TEXT NOT NULL REFERENCES ch_agents_config(id) ON DELETE CASCADE,
    server_id TEXT NOT NULL REFERENCES ch_mcp_servers(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_by TEXT,
    UNIQUE(agent_id, server_id)
);
