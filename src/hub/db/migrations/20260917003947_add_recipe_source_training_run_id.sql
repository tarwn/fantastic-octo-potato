-- migrate:up

ALTER TABLE recipe ADD COLUMN source_training_run_id TEXT;

-- migrate:down

ALTER TABLE recipe DROP COLUMN source_training_run_id;

