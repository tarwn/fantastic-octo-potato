-- migrate:up

-- One row per operator command sent to the Runner during Interactive-User. command_key is the client's
-- idempotency key (a resubmit returns the original row). raw_payload is read only by the Runner endpoint;
-- safe_payload is the only form any Hub/Job response may carry. Pending commands are Voided, never
-- executed, when the Job leaves Interactive-User.
CREATE TABLE intervention_command (
	id INTEGER PRIMARY KEY,
	job_id INTEGER NOT NULL REFERENCES job (id),
	command_key TEXT NOT NULL,
	kind TEXT NOT NULL,
	raw_payload TEXT NOT NULL,
	safe_payload TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Completed', 'Voided')),
	created_at TEXT NOT NULL,
	UNIQUE (job_id, command_key)
);

-- migrate:down
DROP TABLE intervention_command;
