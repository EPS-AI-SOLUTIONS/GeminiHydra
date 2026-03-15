-- Seed default MCP permissions for Geralt (agent-001)

INSERT INTO gh_mcp_permissions (agent_id, server_id)
SELECT 'agent-001', id 
FROM gh_mcp_servers 
ON CONFLICT (agent_id, server_id) DO NOTHING;

