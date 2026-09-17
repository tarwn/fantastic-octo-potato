-- migrate:up

-- System data (never touched by db:reset): explicit ids below mirror the JobStatus TS enum.
CREATE TABLE job_status (
	id INTEGER PRIMARY KEY,
	name TEXT NOT NULL
);

INSERT INTO job_status (id, name) VALUES
	(1, 'Pending'),
	(2, 'Running'),
	(3, 'Completed-Success'),
	(4, 'Completed-Failed'),
	(5, 'Completed-Cancelled');

CREATE TABLE job (
	id INTEGER PRIMARY KEY,
	customer_application_xref_id INTEGER NOT NULL REFERENCES customer_application_xref (id),
	mode TEXT NOT NULL,
	job_status_id INTEGER NOT NULL REFERENCES job_status (id),
	goal TEXT NOT NULL,
	starting_url TEXT NOT NULL,
	allowlist TEXT NOT NULL,
	max_steps INTEGER NOT NULL,
	runner_id INTEGER REFERENCES runner (id),
	created_at TEXT NOT NULL,
	started_at TEXT,
	heartbeat_on TEXT,
	completed_at TEXT
);

CREATE TABLE job_transcript_entry (
	id INTEGER PRIMARY KEY,
	job_id INTEGER NOT NULL REFERENCES job (id),
	sequence INTEGER NOT NULL,
	kind TEXT NOT NULL,
	text TEXT NOT NULL,
	created_at TEXT NOT NULL,
	UNIQUE (job_id, sequence)
);

CREATE TABLE job_result (
	id INTEGER PRIMARY KEY,
	job_id INTEGER NOT NULL REFERENCES job (id),
	field_name TEXT NOT NULL,
	value TEXT NOT NULL,
	created_at TEXT NOT NULL,
	UNIQUE (job_id, field_name)
);

-- migrate:down
DROP TABLE job_result;
DROP TABLE job_transcript_entry;
DROP TABLE job;
DROP TABLE job_status;
