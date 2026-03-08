-- Add duration tracking to A2A tasks
ALTER TABLE gh_a2a_tasks ADD COLUMN IF NOT EXISTS duration_ms INTEGER DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_a2a_tasks_duration ON gh_a2a_tasks(duration_ms) WHERE duration_ms IS NOT NULL;
