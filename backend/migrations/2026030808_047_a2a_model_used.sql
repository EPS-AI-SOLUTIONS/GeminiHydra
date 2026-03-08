-- Add model_used to A2A tasks
ALTER TABLE gh_a2a_tasks ADD COLUMN IF NOT EXISTS model_used TEXT;