import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openDb } from "./connection";

const scratchDir = join(import.meta.dirname, "_scratch");

afterEach(() => {
	rmSync(scratchDir, { recursive: true, force: true });
});

describe("openDb", () => {
	it("creates the parent directory and opens a database file at the resolved path", () => {
		const dbPath = join(scratchDir, "nested", "hub.db");
		expect(existsSync(dbPath)).toBe(false);

		const db = openDb(`sqlite:${dbPath}`);
		db.close();

		expect(existsSync(dbPath)).toBe(true);
	});

	it("enforces foreign key constraints, since SQLite ignores them by default", () => {
		const dbPath = join(scratchDir, "fk.db");
		const db = openDb(`sqlite:${dbPath}`);
		db.exec(`
			CREATE TABLE parent (id INTEGER PRIMARY KEY);
			CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent (id));
		`);

		expect(() => db.prepare("INSERT INTO child (id, parent_id) VALUES (1, 999)").run()).toThrow(
			/FOREIGN KEY constraint failed/
		);

		db.close();
	});
});
