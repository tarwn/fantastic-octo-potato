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
		`);
	}

	it("empties every user-defined table", () => {
		seedUserRows();

		resetUserData(getDb());

		for (const table of ["customer", "application", "customer_application_xref", "runner", "recipe"]) {
			const { count } = getDb().prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
			expect(count).toBe(0);
		}
	});

	it("never touches system-defined rows", () => {
		seedUserRows();

		resetUserData(getDb());

		const rows = getDb().prepare("SELECT id, name FROM recipe_status ORDER BY id").all();
		expect(rows).toEqual([
			{ id: 1, name: "Draft" },
			{ id: 2, name: "Released" }
		]);
	});
});
