CREATE TABLE IF NOT EXISTS agent_profiles (
    id UUID PRIMARY KEY,
    name VARCHAR NOT NULL,
    system_prompt TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
