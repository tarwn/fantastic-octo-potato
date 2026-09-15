import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { JobStatus } from "./jobStatus";

const migrationsDir = join(import.meta.dirname, "..", "..", "..", "..", "db", "migrations");

// Regex-parses the seed INSERT rather than running dbmate; if a later migration reshapes or
// moves this statement, update the match here rather than assuming the drift-guard still works.
function readSeededJobStatusRows(): { id: number; name: string }[] {
	const migrationFile = readdirSync(migrationsDir).find((name) => name.endsWith("_create_job_tables.sql"));
	const sql = readFileSync(join(migrationsDir, migrationFile as string), "utf-8");
	const insertStatement = sql.match(/INSERT INTO job_status \(id, name\) VALUES\s*([\s\S]+?);/);
	return [...(insertStatement as RegExpMatchArray)[1].matchAll(/\((\d+),\s*'([^']+)'\)/g)].map(([, id, name]) => ({
		id: Number(id),
		name
	}));
}

describe("JobStatus", () => {
	it("matches the ids and names seeded for job_status in the create_job_tables migration", () => {
		expect(readSeededJobStatusRows()).toEqual([
			{ id: JobStatus.Pending, name: "Pending" },
			{ id: JobStatus.Running, name: "Running" },
			{ id: JobStatus.CompletedSuccess, name: "Completed-Success" },
			{ id: JobStatus.CompletedFailed, name: "Completed-Failed" },
			{ id: JobStatus.CompletedCancelled, name: "Completed-Cancelled" }
		]);
	});
});
