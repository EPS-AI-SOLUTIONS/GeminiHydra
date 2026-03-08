-- Add progress tracking to A2A tasks
ALTER TABLE gh_a2a_tasks ADD COLUMN IF NOT EXISTS completed_steps INTEGER DEFAULT 0;
ALTER TABLE gh_a2a_tasks ADD COLUMN IF NOT EXISTS estimated_steps INTEGER DEFAULT 5;