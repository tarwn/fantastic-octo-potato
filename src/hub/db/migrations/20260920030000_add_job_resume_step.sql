-- migrate:up

-- The Step id the owner handed control back at; the Runner picks it up from the status poll and
-- clears it by reporting Running (or Intervention-Requested again if that Step fails).
ALTER TABLE job ADD COLUMN resume_step_id TEXT;

-- migrate:down
ALTER TABLE job DROP COLUMN resume_step_id;
