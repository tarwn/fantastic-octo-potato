import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { TranscriptKind } from "./jobTranscriptKind";

const migrationsDir = join(import.meta.dirname, "..", "..", "..", "..", "..", "db", "migrations");

// Regex-parses the seed INSERT rather than running dbmate; if a later migration reshapes or
// moves this statement, update the match here rather than assuming the drift-guard still works.
function readSeededTranscriptKindRows(): { id: number; name: string }[] {
	const migrationFile = readdirSync(migrationsDir).find((name) => name.endsWith("_restructure_job_tables.sql"));
	const sql = readFileSync(join(migrationsDir, migrationFile as string), "utf-8");
	const insertStatement = sql.match(/INSERT INTO job_transcript_kind \(id, name\) VALUES\s*([\s\S]+?);/);
	return [...(insertStatement as RegExpMatchArray)[1].matchAll(/\((\d+),\s*'([^']+)'\)/g)].map(([, id, name]) => ({
		id: Number(id),
		name
	}));
}

describe("TranscriptKind", () => {
	it("matches the ids and names seeded for job_transcript_kind in the restructure_job_tables migration", () => {
		expect(readSeededTranscriptKindRows()).toEqual([
			{ id: TranscriptKind.Status, name: "Status" },
			{ id: TranscriptKind.Info, name: "Info" },
			{ id: TranscriptKind.Step, name: "Step" },
			{ id: TranscriptKind.Recover, name: "Recover" },
			{ id: TranscriptKind.Halt, name: "Halt" },
			{ id: TranscriptKind.Observe, name: "Observe" },
			{ id: TranscriptKind.Plan, name: "Plan" }
		]);
	});
});
