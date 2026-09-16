import type Database from "better-sqlite3";

// Order matters: children before parents, to satisfy foreign key constraints.
const USER_DEFINED_TABLES = [
	"job_ingredient",
	"job_result",
	"job_transcript_entry",
	"training_job",
	"recipe_job",
	"job",
	"recipe",
	"runner",
	"customer_application_xref",
	"application",
	"customer"
];

export function resetUserData(db: Database.Database): void {
	const existingTables = new Set(
		(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
			(row) => row.name
		)
	);

	for (const table of USER_DEFINED_TABLES) {
		if (existingTables.has(table)) {
			db.prepare(`DELETE FROM ${table}`).run();
		}
	}
}
