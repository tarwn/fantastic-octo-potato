-- migrate:up

-- SQLite can't add a NOT NULL column without a default, so the '' default only exists to let the
-- ADD COLUMN and the one-time backfill below run; insertJob always supplies the real name.
ALTER TABLE job ADD COLUMN name TEXT NOT NULL DEFAULT '';

UPDATE job SET name = 'Training Run' WHERE job_type_id = 1;
-- recipe_job.recipe_id is nullable, so a Recipe Job without a Recipe still needs a name for NOT NULL.
UPDATE job SET name = COALESCE((
	SELECT recipe.name FROM recipe_job JOIN recipe ON recipe.id = recipe_job.recipe_id WHERE recipe_job.job_id = job.id
), 'Recipe Job') WHERE job_type_id = 2;

-- migrate:down
ALTER TABLE job DROP COLUMN name;
