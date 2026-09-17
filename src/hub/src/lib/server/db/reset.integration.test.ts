import { describe, expect, it } from "vitest";

import { useIntegrationTestDb } from "./_test/integrationTestDb";
import { resetUserData } from "./reset";

describe("resetUserData", () => {
	const getDb = useIntegrationTestDb();

	function seedUserRows(): void {
		const db = getDb();
		db.exec(`
			INSERT INTO customer (id, name) VALUES (1, 'Acme');
			INSERT INTO application (id, name) VALUES (1, 'Widgets');
			INSERT INTO customer_application_xref (id, customer_id, application_id) VALUES (1, 1, 1);
			INSERT INTO runner (id, customer_application_xref_id) VALUES (1, 1);
			INSERT INTO recipe (id, customer_application_xref_id, recipe_status_id, version, name, goal, definition, created_at)
				VALUES (1, 1, 1, 1, 'Recipe', 'Goal', '{}', '2026-01-01T00:00:00.000Z');
			INSERT INTO job (id, customer_application_xref_id, job_type_id, job_status_id, created_at)
				VALUES (1, 1, 1, 1, '2026-01-01T00:00:00.000Z');
			INSERT INTO training_job (job_id, goal, starting_url, allowlist, max_steps)
				VALUES (1, 'Goal', 'https://example.com', 'https://example.com', 10);
			INSERT INTO job_transcript_entry (job_id, sequence, job_transcript_kind_id, text, created_at)
				VALUES (1, 1, 3, 'Did a thing', '2026-01-01T00:00:00.000Z');
			INSERT INTO job_result (job_id, field_name, raw_value, safe_value, sensitivity_type_id, created_at)
				VALUES (1, 'field', 'value', 'value', 1, '2026-01-01T00:00:00.000Z');
			INSERT INTO job_ingredient (job_id, field_name, raw_value, safe_value, sensitivity_type_id, created_at)
				VALUES (1, 'field', 'value', 'value', 1, '2026-01-01T00:00:00.000Z');
		`);
	}

	it("empties every user-defined table", () => {
		seedUserRows();

		resetUserData(getDb());

		for (const table of [
			"customer",
			"application",
			"customer_application_xref",
			"runner",
			"recipe",
			"job",
			"training_job",
			"recipe_job",
			"job_transcript_entry",
			"job_result",
			"job_ingredient"
		]) {
			const { count } = getDb().prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
			expect(count).toBe(0);
		}
	});

	it("never touches system-defined rows", () => {
		seedUserRows();

		resetUserData(getDb());

		const recipeStatusRows = getDb().prepare("SELECT id, name FROM recipe_status ORDER BY id").all();
		expect(recipeStatusRows).toEqual([
			{ id: 1, name: "Draft" },
			{ id: 2, name: "Released" }
		]);

		const jobStatusRows = getDb().prepare("SELECT id, name FROM job_status ORDER BY id").all();
		expect(jobStatusRows).toEqual([
			{ id: 1, name: "Pending" },
			{ id: 2, name: "Running" },
			{ id: 3, name: "Completed-Success" },
			{ id: 4, name: "Completed-Failed" },
			{ id: 5, name: "Completed-Cancelled" },
			{ id: 6, name: "Intervention-Requested" },
			{ id: 7, name: "Completed-Error" }
		]);
	});
});
