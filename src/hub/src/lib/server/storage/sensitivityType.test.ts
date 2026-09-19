import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SensitivityType } from "./sensitivityType";

const migrationsDir = join(import.meta.dirname, "..", "..", "..", "..", "db", "migrations");

// Regex-parses the seed INSERT rather than running dbmate; if a later migration reshapes or
// moves this statement, update the match here rather than assuming the drift-guard still works.
function readSeededSensitivityTypeRows(): { id: number; name: string }[] {
	const migrationFile = readdirSync(migrationsDir).find((name) => name.endsWith("_restructure_job_tables.sql"));
	const sql = readFileSync(join(migrationsDir, migrationFile as string), "utf-8");
	const insertStatement = sql.match(/INSERT INTO sensitivity_type \(id, name\) VALUES\s*([\s\S]+?);/);
	return [...(insertStatement as RegExpMatchArray)[1].matchAll(/\((\d+),\s*'([^']+)'\)/g)].map(([, id, name]) => ({
		id: Number(id),
		name
	}));
}

describe("SensitivityType", () => {
	it("matches the ids and names seeded for sensitivity_type in the restructure_job_tables migration", () => {
		expect(readSeededSensitivityTypeRows()).toEqual([
			{ id: SensitivityType.None, name: "None" },
			{ id: SensitivityType.PII, name: "PII" },
			{ id: SensitivityType.Other, name: "Other" }
		]);
	});
});
