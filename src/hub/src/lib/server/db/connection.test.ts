import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openDb, requireDatabaseUrl, resolveDatabasePath } from "./connection";

const scratchDir = join(import.meta.dirname, "_scratch");

afterEach(() => {
	rmSync(scratchDir, { recursive: true, force: true });
});

describe("resolveDatabasePath", () => {
	it("strips the sqlite: scheme prefix", () => {
		expect(resolveDatabasePath("sqlite:.data/hub.db")).toBe(".data/hub.db");
	});

	it("throws for a URL missing the sqlite: scheme", () => {
		expect(() => resolveDatabasePath("postgres://localhost/hub")).toThrow(/sqlite:/);
	});
});

describe("openDb", () => {
	it("creates the parent directory and opens a database file at the resolved path", () => {
		const dbPath = join(scratchDir, "nested", "hub.db");
		expect(existsSync(dbPath)).toBe(false);

		const db = openDb(`sqlite:${dbPath}`);
		db.close();

		expect(existsSync(dbPath)).toBe(true);
	});
});

describe("requireDatabaseUrl", () => {
	it("returns the URL when set", () => {
		expect(requireDatabaseUrl("sqlite:.data/hub.db")).toBe("sqlite:.data/hub.db");
	});

	it("throws when HUB_DATABASE_URL is missing, rather than falling back to a default", () => {
		expect(() => requireDatabaseUrl(undefined)).toThrow(/HUB_DATABASE_URL is not set/);
	});
});
