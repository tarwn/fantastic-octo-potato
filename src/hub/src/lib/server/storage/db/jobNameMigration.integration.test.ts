import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { openDb } from "./connection";

const hubRoot = join(import.meta.dirname, "..", "..", "..", "..", "..");
const migrationsDir = join(hubRoot, "db", "migrations");
const scratchDir = join(hubRoot, ".data", "_test-scratch");
const dbmateBin = join(hubRoot, "..", "..", "node_modules", ".bin", process.platform === "win32" ? "dbmate.cmd" : "dbmate");
const JOB_NAME_MIGRATION_SUFFIX = "_add_job_name.sql";

function dbmateUp(migrationsPath: string, dbPath: string): void {
	execSync(`"${dbmateBin}" --no-dump-schema --migrations-dir "${migrationsPath}" --env JOB_NAME_MIGRATION_DATABASE_URL up`, {
		cwd: hubRoot,
		env: { ...process.env, JOB_NAME_MIGRATION_DATABASE_URL: `sqlite:${dbPath}?_journal_mode=MEMORY&_synchronous=OFF` }
	});
}

describe("add_job_name migration", () => {
	const testRoot = join(scratchDir, randomUUID());

	afterAll(() => {
		rmSync(testRoot, { recursive: true, force: true });
	});

	it("backfills existing Jobs: Recipe Jobs take their Recipe's name (or 'Recipe Job' without one), Training Jobs become 'Training Run'", () => {
		const stagedMigrationsDir = join(testRoot, "migrations");
		const dbPath = join(testRoot, "backfill.db");
		mkdirSync(stagedMigrationsDir, { recursive: true });
		const migrationFiles = readdirSync(migrationsDir).sort();
		const jobNameMigrationFile = migrationFiles.find((file) => file.endsWith(JOB_NAME_MIGRATION_SUFFIX))!;
		for (const file of migrationFiles.filter((file) => file !== jobNameMigrationFile)) {
			copyFileSync(join(migrationsDir, file), join(stagedMigrationsDir, file));
		}
		dbmateUp(stagedMigrationsDir, dbPath);

		const before = openDb(`sqlite:${dbPath}`);
		before.exec(`
			INSERT INTO customer (id, name) VALUES (1, 'Acme');
			INSERT INTO application (id, name) VALUES (1, 'Widgets');
			INSERT INTO customer_application_xref (id, customer_id, application_id) VALUES (1, 1, 1);
			INSERT INTO recipe (id, customer_application_xref_id, recipe_status_id, version, name, goal, definition, created_at)
				VALUES (1, 1, 2, 1, 'Existing recipe', 'Goal', '{}', '2026-01-01T00:00:00.000Z');
			INSERT INTO job (id, customer_application_xref_id, job_type_id, job_status_id, created_at)
				VALUES (1, 1, 1, 1, '2026-01-01T00:00:00.000Z'), (2, 1, 2, 1, '2026-01-01T00:00:00.000Z'), (3, 1, 2, 1, '2026-01-01T00:00:00.000Z');
			INSERT INTO training_job (job_id, goal, starting_url, allowlist, max_steps)
				VALUES (1, 'Goal', 'https://example.com', 'https://example.com', 10);
			INSERT INTO recipe_job (job_id, recipe_id) VALUES (2, 1), (3, NULL);
		`);
		before.close();

		copyFileSync(join(migrationsDir, jobNameMigrationFile), join(stagedMigrationsDir, jobNameMigrationFile));
		dbmateUp(stagedMigrationsDir, dbPath);

		const after = openDb(`sqlite:${dbPath}`);
		const names = after.prepare("SELECT id, name FROM job ORDER BY id").all();
		after.close();
		expect(names).toEqual([
			{ id: 1, name: "Training Run" },
			{ id: 2, name: "Existing recipe" },
			{ id: 3, name: "Recipe Job" }
		]);
	});
});
