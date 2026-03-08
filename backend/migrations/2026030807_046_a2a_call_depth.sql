-- Add call_depth to A2A tasks to better visualize agent delegation trees
ALTER TABLE gh_a2a_tasks ADD COLUMN IF NOT EXISTS call_depth INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_a2a_tasks_call_depth ON gh_a2a_tasks(call_depth);