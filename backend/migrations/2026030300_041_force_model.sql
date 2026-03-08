-- Migration 041: Add force_model to gh_settings
-- Allows overriding model selection for ALL agents globally (priority 0)
ALTER TABLE gh_settings ADD COLUMN IF NOT EXISTS force_model TEXT DEFAULT NULL;
