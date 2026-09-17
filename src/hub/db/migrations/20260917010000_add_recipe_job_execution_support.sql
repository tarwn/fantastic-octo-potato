-- migrate:up

-- System data (never touched by db:reset): explicit ids below mirror the JobStatus TS enum.
-- Intervention-Requested is a halted, non-terminal state (ARCHITECTURE.md's Core Loop); Completed-Error is terminal.
INSERT INTO job_status (id, name) VALUES
	(6, 'Intervention-Requested'),
	(7, 'Completed-Error');

-- No code path creates a Recipe Job yet (see 20260916113338's recipe_job scaffolding note), so
-- these NOT NULL additions are safe: mode/allowlist/step_timeout_ms are the Job-level fields a
-- Recipe Job needs to build the runner dispatch payload (recipe.md's `{..., controls, stepTimeoutMs, ...}`),
-- mirroring training_job's allowlist rather than restructuring the shared `job` table.
ALTER TABLE recipe_job ADD COLUMN mode TEXT NOT NULL DEFAULT 'Trial';
ALTER TABLE recipe_job ADD COLUMN allowlist TEXT NOT NULL DEFAULT '';
ALTER TABLE recipe_job ADD COLUMN step_timeout_ms INTEGER NOT NULL DEFAULT 15000;

-- Metadata for a per-Step/terminal screenshot the Runner uploads. The image bytes
-- themselves live on disk (src/hub/src/lib/server/artifactStorage.ts) — the Runner has already
-- masked them before upload, so unlike job_result there is no separate raw/safe pair to store.
CREATE TABLE job_step_artifact (
	id INTEGER PRIMARY KEY,
	job_id INTEGER NOT NULL REFERENCES job (id),
	step_id TEXT NOT NULL,
	file_path TEXT NOT NULL,
	created_at TEXT NOT NULL
);

-- migrate:down
DROP TABLE job_step_artifact;
ALTER TABLE recipe_job DROP COLUMN step_timeout_ms;
ALTER TABLE recipe_job DROP COLUMN allowlist;
ALTER TABLE recipe_job DROP COLUMN mode;
DELETE FROM job_status WHERE id IN (6, 7);
