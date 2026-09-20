-- migrate:up

-- No code path creates a Training Job with these fields yet, so these NOT NULL additions are
-- safe. step_timeout_ms mirrors recipe_job's per-Step timeout (20260917010000). alternate_goals
-- is a JSON-encoded string array (empty array default) — Training's own DSL/transcript already
-- use JSON-in-TEXT columns (job_transcript_entry.text), so this follows that existing convention
-- rather than a new join table for what's just a handful of operator-entered strings.
-- synthetic_data_confirmed lets an operator waive the third-party PII masking pass for a run
-- confirmed to be synthetic data (known-secrets masking always still applies).
ALTER TABLE training_job ADD COLUMN alternate_goals TEXT NOT NULL DEFAULT '[]';
ALTER TABLE training_job ADD COLUMN synthetic_data_confirmed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE training_job ADD COLUMN step_timeout_ms INTEGER NOT NULL DEFAULT 15000;

-- migrate:down
ALTER TABLE training_job DROP COLUMN step_timeout_ms;
ALTER TABLE training_job DROP COLUMN synthetic_data_confirmed;
ALTER TABLE training_job DROP COLUMN alternate_goals;
