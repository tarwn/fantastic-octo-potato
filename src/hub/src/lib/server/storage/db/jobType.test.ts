import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { JobType } from "./jobType";

const migrationsDir = join(import.meta.dirname, "..", "..", "..", "..", "..", "db", "migrations");

// Regex-parses the seed INSERT rather than running dbmate; if a later migration reshapes or
// moves this statement, update the match here rather than assuming the drift-guard still works.
function readSeededJobTypeRows(): { id: number; name: string }[] {
	const migrationFile = readdirSync(migrationsDir).find((name) => name.endsWith("_restructure_job_tables.sql"));
	const sql = readFileSync(join(migrationsDir, migrationFile as string), "utf-8");
	const insertStatement = sql.match(/INSERT INTO job_type \(id, name\) VALUES\s*([\s\S]+?);/);
	return [...(insertStatement as RegExpMatchArray)[1].matchAll(/\((\d+),\s*'([^']+)'\)/g)].map(([, id, name]) => ({
		id: Number(id),
		name
	}));
}

describe("JobType", () => {
	it("matches the ids and names seeded for job_type in the restructure_job_tables migration", () => {
		expect(readSeededJobTypeRows()).toEqual([
			{ id: JobType.TrainingRun, name: "Training" },
			{ id: JobType.Recipe, name: "Recipe" }
		]);
	});
});
