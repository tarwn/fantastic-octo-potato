-- migrate:up
CREATE TABLE customer (
	id INTEGER PRIMARY KEY,
	name TEXT NOT NULL
);

CREATE TABLE application (
	id INTEGER PRIMARY KEY,
	name TEXT NOT NULL
);

CREATE TABLE customer_application_xref (
	id INTEGER PRIMARY KEY,
	customer_id INTEGER NOT NULL REFERENCES customer (id),
	application_id INTEGER NOT NULL REFERENCES application (id)
);

CREATE TABLE runner (
	id INTEGER PRIMARY KEY,
	customer_application_xref_id INTEGER NOT NULL REFERENCES customer_application_xref (id),
	last_heartbeat_on TEXT
);

-- System data (never touched by db:reset): explicit ids below mirror the RecipeStatus TS enum.
CREATE TABLE recipe_status (
	id INTEGER PRIMARY KEY,
	name TEXT NOT NULL
);

INSERT INTO recipe_status (id, name) VALUES (1, 'Draft'), (2, 'Released');

CREATE TABLE recipe (
	id INTEGER PRIMARY KEY,
	customer_application_xref_id INTEGER NOT NULL REFERENCES customer_application_xref (id),
	recipe_status_id INTEGER NOT NULL REFERENCES recipe_status (id),
	version INTEGER NOT NULL,
	name TEXT NOT NULL,
	goal TEXT NOT NULL,
	definition TEXT NOT NULL,
	created_at TEXT NOT NULL,
	published_at TEXT
);

-- migrate:down
DROP TABLE recipe;
DROP TABLE recipe_status;
DROP TABLE runner;
DROP TABLE customer_application_xref;
DROP TABLE application;
DROP TABLE customer;
