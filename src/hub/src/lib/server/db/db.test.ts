import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv: { HUB_DATABASE_URL?: string } = {};

vi.mock("$env/dynamic/private", () => ({ env: mockEnv }));

const openDb = vi.fn((databaseUrl: string) => ({ databaseUrl }));
vi.mock("./connection", () => ({
	openDb: (databaseUrl: string) => openDb(databaseUrl),
	requireDatabaseUrl: (databaseUrl: string | undefined) => {
		if (!databaseUrl) {
			throw new Error("HUB_DATABASE_URL is not set");
		}
		return databaseUrl;
	}
}));

beforeEach(() => {
	delete mockEnv.HUB_DATABASE_URL;
	openDb.mockClear();
	vi.resetModules();
});

describe("getDb", () => {
	it("throws rather than silently falling back when HUB_DATABASE_URL is unset", async () => {
		const { getDb } = await import("./db");

		expect(() => getDb()).toThrow(/HUB_DATABASE_URL is not set/);
		expect(openDb).not.toHaveBeenCalled();
	});

	it("opens the URL from HUB_DATABASE_URL when set", async () => {
		mockEnv.HUB_DATABASE_URL = "sqlite:.data/hub.custom.db";
		const { getDb } = await import("./db");

		getDb();

		expect(openDb).toHaveBeenCalledWith("sqlite:.data/hub.custom.db");
	});

	it("reuses the same connection across calls", async () => {
		mockEnv.HUB_DATABASE_URL = "sqlite:.data/hub.custom.db";
		const { getDb } = await import("./db");

		const first = getDb();
		const second = getDb();

		expect(second).toBe(first);
		expect(openDb).toHaveBeenCalledTimes(1);
	});
});
