-- migrate:up

-- System data (never touched by db:reset): explicit id mirrors the JobStatus TS enum.
INSERT INTO job_status (id, name) VALUES (8, 'Interactive-User');

-- intervention_owner is the client-generated operatorId that took control (an ownership token, not an identity);
-- blocked_step_id/blocked_reason are what the Runner reported when it requested intervention.
ALTER TABLE job ADD COLUMN intervention_owner TEXT;
ALTER TABLE job ADD COLUMN blocked_step_id TEXT;
ALTER TABLE job ADD COLUMN blocked_reason TEXT;

-- migrate:down
ALTER TABLE job DROP COLUMN blocked_reason;
ALTER TABLE job DROP COLUMN blocked_step_id;
ALTER TABLE job DROP COLUMN intervention_owner;
DELETE FROM job_status WHERE id = 8;
