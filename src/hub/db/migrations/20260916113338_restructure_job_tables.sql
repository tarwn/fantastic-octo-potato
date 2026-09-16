-- migrate:up

-- System data (never touched by db:reset): explicit ids below mirror the TranscriptKind TS enum.
CREATE TABLE job_transcript_kind (
	id INTEGER PRIMARY KEY,
	name TEXT NOT NULL
);

INSERT INTO job_transcript_kind (id, name) VALUES
	(1, 'Status'),
	(2, 'Info'),
	(3, 'Step'),
	(4, 'Recover'),
	(5, 'Halt'),
	(6, 'Observe'),
	(7, 'Plan');

-- System data (never touched by db:reset): explicit ids below mirror the JobType TS enum.
CREATE TABLE job_type (
	id INTEGER PRIMARY KEY,
	name TEXT NOT NULL
);

INSERT INTO job_type (id, name) VALUES
	(1, 'Training'),
	(2, 'Recipe');

-- System data (never touched by db:reset): explicit ids below mirror the SensitivityType TS enum.
CREATE TABLE sensitivity_type (
	id INTEGER PRIMARY KEY,
	name TEXT NOT NULL
);

INSERT INTO sensitivity_type (id, name) VALUES
	(1, 'None'),
	(2, 'PII'),
	(3, 'Other');

-- No production Job data exists yet, so the old single-table `job`/`job_transcript_entry`/
-- `job_result` shapes are dropped and recreated rather than migrated in place.
DROP TABLE job_result;
DROP TABLE job_transcript_entry;
DROP TABLE job;

CREATE TABLE job (
	id INTEGER PRIMARY KEY,
	customer_application_xref_id INTEGER NOT NULL REFERENCES customer_application_xref (id),
	job_type_id INTEGER NOT NULL REFERENCES job_type (id),
	job_status_id INTEGER NOT NULL REFERENCES job_status (id),
	runner_id INTEGER REFERENCES runner (id),
	created_at TEXT NOT NULL,
	started_at TEXT,
	heartbeat_on TEXT,
	completed_at TEXT
);

-- One row iff job.job_type_id = Training. Fields moved unchanged from the original spec-0006 `job` table.
CREATE TABLE training_job (
	job_id INTEGER PRIMARY KEY REFERENCES job (id),
	goal TEXT NOT NULL,
	starting_url TEXT NOT NULL,
	allowlist TEXT NOT NULL,
	max_steps INTEGER NOT NULL
);

-- One row iff job.job_type_id = Recipe. Structural scaffolding only —
-- no code path creates or runs a Recipe-based Job yet.
CREATE TABLE recipe_job (
	job_id INTEGER PRIMARY KEY REFERENCES job (id),
	recipe_id INTEGER REFERENCES recipe (id)
);

CREATE TABLE job_transcript_entry (
	id INTEGER PRIMARY KEY,
	job_id INTEGER NOT NULL REFERENCES job (id),
	sequence INTEGER NOT NULL,
	job_transcript_kind_id INTEGER NOT NULL REFERENCES job_transcript_kind (id),
	text TEXT NOT NULL,
	created_at TEXT NOT NULL,
	job_status_id INTEGER REFERENCES job_status (id),
	UNIQUE (job_id, sequence)
);

CREATE TABLE job_result (
	id INTEGER PRIMARY KEY,
	job_id INTEGER NOT NULL REFERENCES job (id),
	field_name TEXT NOT NULL,
	raw_value TEXT NOT NULL,
	safe_value TEXT NOT NULL,
	sensitivity_type_id INTEGER NOT NULL REFERENCES sensitivity_type (id),
	created_at TEXT NOT NULL,
	UNIQUE (job_id, field_name)
);

-- The merged Customer+Job input values for a Job — a Training Job's ingredients are the
-- values collected for it, a Recipe Job's are its declared inputs (not exercised this spec).
CREATE TABLE job_ingredient (
	id INTEGER PRIMARY KEY,
	job_id INTEGER NOT NULL REFERENCES job (id),
	field_name TEXT NOT NULL,
	raw_value TEXT NOT NULL,
	safe_value TEXT NOT NULL,
	sensitivity_type_id INTEGER NOT NULL REFERENCES sensitivity_type (id),
	created_at TEXT NOT NULL,
	UNIQUE (job_id, field_name)
);

-- migrate:down
DROP TABLE job_ingredient;
DROP TABLE job_result;
DROP TABLE job_transcript_entry;
DROP TABLE recipe_job;
DROP TABLE training_job;
DROP TABLE job;

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
	job_status_id INTEGER REFERENCES job_status (id),
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

DROP TABLE sensitivity_type;
DROP TABLE job_type;
DROP TABLE job_transcript_kind;
