import { describe, expect, it } from "vitest";

import { requireDatabaseUrl, resolveDatabasePath } from "./connection";

describe("resolveDatabasePath", () => {
	it("strips the sqlite: scheme prefix", () => {
		expect(resolveDatabasePath("sqlite:.data/hub.db")).toBe(".data/hub.db");
	});

	it("throws for a URL missing the sqlite: scheme", () => {
		expect(() => resolveDatabasePath("postgres://localhost/hub")).toThrow(/sqlite:/);
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
