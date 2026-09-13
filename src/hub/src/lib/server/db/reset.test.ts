import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { resetUserData } from "./reset";

function createSeededDb(): Database.Database {
	const db = new Database(":memory:");
	db.exec(`
		CREATE TABLE customer (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
		CREATE TABLE application (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
		CREATE TABLE customer_application_xref (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, application_id INTEGER NOT NULL);
		CREATE TABLE runner (id INTEGER PRIMARY KEY, customer_application_xref_id INTEGER NOT NULL);
		CREATE TABLE recipe (id INTEGER PRIMARY KEY, customer_application_xref_id INTEGER NOT NULL);
		CREATE TABLE recipe_status (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
		INSERT INTO recipe_status (id, name) VALUES (1, 'Draft'), (2, 'Released');
		INSERT INTO customer (id, name) VALUES (1, 'Acme');
		INSERT INTO application (id, name) VALUES (1, 'Widgets');
		INSERT INTO customer_application_xref (id, customer_id, application_id) VALUES (1, 1, 1);
		INSERT INTO runner (id, customer_application_xref_id) VALUES (1, 1);
		INSERT INTO recipe (id, customer_application_xref_id) VALUES (1, 1);
	`);
	return db;
}

describe("resetUserData", () => {
	it("empties every user-defined table", () => {
		const db = createSeededDb();

		resetUserData(db);

		for (const table of ["customer", "application", "customer_application_xref", "runner", "recipe"]) {
			const { count } = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
			expect(count).toBe(0);
		}
	});

	it("never touches system-defined rows", () => {
		const db = createSeededDb();

		resetUserData(db);

		const rows = db.prepare("SELECT id, name FROM recipe_status ORDER BY id").all();
		expect(rows).toEqual([
			{ id: 1, name: "Draft" },
			{ id: 2, name: "Released" }
		]);
	});

	it("does nothing when the user-defined tables don't exist yet", () => {
		const db = new Database(":memory:");

		expect(() => resetUserData(db)).not.toThrow();
	});
});
