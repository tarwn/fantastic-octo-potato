-- migrate:up

-- Persists each Step Hub hands the Runner during Training, before the Runner ever sees it — the
-- transcript alone (message/outcome/masked in-out field refs) can't reconstruct the actual DSL
-- action/args a Step used, which Recipe compilation (a later step) needs to build a real
-- RecipeDefinition from what a run actually executed. `definition` is the JSON-serialized
-- ChildStep (recipeDefinition.ts), mirroring recipe.definition's own JSON-in-TEXT storage.
-- UNIQUE(job_id, step_id) mirrors steps-dsl.md's "IDs are unique across main steps" rule with a
-- DB-level guard — a later transcript row correlates back to one of these by its stepId.
CREATE TABLE training_job_step (
	id INTEGER PRIMARY KEY,
	job_id INTEGER NOT NULL REFERENCES job (id),
	step_id TEXT NOT NULL,
	definition TEXT NOT NULL,
	created_at TEXT NOT NULL,
	UNIQUE (job_id, step_id)
);

-- migrate:down
DROP TABLE training_job_step;
