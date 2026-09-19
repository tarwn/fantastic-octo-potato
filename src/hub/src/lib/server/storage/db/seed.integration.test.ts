import { afterEach, describe, expect, it, vi } from "vitest";

import { useIntegrationTestDb } from "./_test/integrationTestDb";
import { seed } from "./seed";

afterEach(() => {
	vi.doUnmock("../repositories/runnerRepository.ts");
	vi.resetModules();
});

describe("seed", () => {
	const getDb = useIntegrationTestDb();

	it("inserts one customer, application, xref, and runner", () => {
		seed(getDb());

		for (const table of ["customer", "application", "customer_application_xref", "runner"]) {
			const { count } = getDb().prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
			expect(count).toBe(1);
		}
	});

	it("is idempotent: running it twice still leaves exactly one row in each table", () => {
		seed(getDb());
		seed(getDb());

		for (const table of ["customer", "application", "customer_application_xref", "runner"]) {
			const { count } = getDb().prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
			expect(count).toBe(1);
		}
	});

	it("links the seeded runner to the seeded customer/application through the xref", () => {
		seed(getDb());

		const row = getDb()
			.prepare(
				`SELECT customer.name as customerName, application.name as applicationName
				 FROM runner
				 JOIN customer_application_xref AS xref ON xref.id = runner.customer_application_xref_id
				 JOIN customer ON customer.id = xref.customer_id
				 JOIN application ON application.id = xref.application_id`
			)
			.get();

		expect(row).toEqual({ customerName: "Acme", applicationName: "BambooInvoice" });
	});

	it("seeds two published Recipes (happy path and failing) reachable from the same xref/Runner", () => {
		seed(getDb());

		const rows = getDb().prepare("SELECT name, recipe_status_id AS recipeStatusId FROM recipe ORDER BY id").all() as {
			name: string;
			recipeStatusId: number;
		}[];

		expect(rows).toEqual([
			{ name: "Read seeded invoice", recipeStatusId: 2 },
			{ name: "Broken invoice lookup", recipeStatusId: 2 }
		]);
	});

	it("seeds the runner with no heartbeat, since it has never actually reported in", () => {
		seed(getDb());

		const { last_heartbeat_on: lastHeartbeatOn } = getDb()
			.prepare("SELECT last_heartbeat_on FROM runner")
			.get() as { last_heartbeat_on: string | null };

		expect(lastHeartbeatOn).toBeNull();
	});

	it("rolls back every insert when a later one fails, so a retry can seed cleanly", async () => {
		vi.doMock("../repositories/runnerRepository.ts", () => ({
			insertRunner: () => {
				throw new Error("simulated failure");
			}
		}));
		const { seed: seedWithBrokenRunnerInsert } = await import("./seed");

		expect(() => seedWithBrokenRunnerInsert(getDb())).toThrow("simulated failure");

		for (const table of ["customer", "application", "customer_application_xref", "runner", "recipe"]) {
			const { count } = getDb().prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
			expect(count).toBe(0);
		}
	});
});
