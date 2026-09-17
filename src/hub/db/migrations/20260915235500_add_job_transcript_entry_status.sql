-- migrate:up

-- Nullable: only a "status" kind entry carries the Job's new status, captured at the same
-- moment the transcript row and the job.job_status_id update are written.
ALTER TABLE job_transcript_entry ADD COLUMN job_status_id INTEGER REFERENCES job_status (id);

-- migrate:down
ALTER TABLE job_transcript_entry DROP COLUMN job_status_id;
