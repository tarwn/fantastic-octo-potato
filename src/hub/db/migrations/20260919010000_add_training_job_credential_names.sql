-- migrate:up

-- credential_names is a JSON-encoded string array (empty default) — Hub has no way to know a
-- Training Job's available credential names ahead of time (they resolve only on the Runner, from
-- its own RUNNER_CREDENTIAL_* env vars, credentials.ts); the Runner reports just the names (never
-- values) alongside its first Step's dslStep report. Mirrors alternate_goals's JSON-in-TEXT
-- convention (20260919000000).
ALTER TABLE training_job ADD COLUMN credential_names TEXT NOT NULL DEFAULT '[]';

-- migrate:down
ALTER TABLE training_job DROP COLUMN credential_names;
