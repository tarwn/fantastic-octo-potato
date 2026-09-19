import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { useIntegrationTestDb } from "./_test/integrationTestDb";
import { getRunnerById, insertRunner, listRunnersByCustomerApplicationXrefId, updateRunnerHeartbeat } from "./runnerRepository";

function seedXref(db: Database.Database): void {
	db.exec(`
		INSERT INTO customer (id, name) VALUES (1, 'Acme');
		INSERT INTO application (id, name) VALUES (1, 'Widgets');
		INSERT INTO customer_application_xref (id, customer_id, application_id) VALUES (1, 1, 1);
	`);
}

describe("runnerRepository", () => {
	const getDb = useIntegrationTestDb();

	it("inserts a runner with no heartbeat when none is given", () => {
		seedXref(getDb());

		const runner = insertRunner(getDb(), 1);

		expect(runner).toEqual({ id: 1, customerApplicationXrefId: 1, lastHeartbeatOn: null });
	});

	it("inserts a runner with a heartbeat, stored and returned as a Date", () => {
		seedXref(getDb());
		const heartbeat = new Date("2026-09-14T00:06:12.000Z");

		const runner = insertRunner(getDb(), 1, heartbeat);

		expect(runner).toEqual({ id: 1, customerApplicationXrefId: 1, lastHeartbeatOn: heartbeat });
	});

	it("lists runners for a given xref id, excluding runners on other xrefs", () => {
		const db = getDb();
		seedXref(db);
		db.exec("INSERT INTO customer_application_xref (id, customer_id, application_id) VALUES (2, 1, 1);");
		const heartbeat = new Date("2026-09-14T00:06:12.000Z");
		insertRunner(db, 1, heartbeat);
		insertRunner(db, 2);

		expect(listRunnersByCustomerApplicationXrefId(db, 1)).toEqual([
			{ id: 1, customerApplicationXrefId: 1, lastHeartbeatOn: heartbeat }
		]);
	});

	it("gets a runner by id", () => {
		seedXref(getDb());
		const runner = insertRunner(getDb(), 1);

		expect(getRunnerById(getDb(), runner.id)).toEqual(runner);
	});

	it("returns undefined for an unknown runner id", () => {
		expect(getRunnerById(getDb(), 999)).toBeUndefined();
	});

	it("updates a runner's heartbeat", () => {
		seedXref(getDb());
		const runner = insertRunner(getDb(), 1);
		const heartbeat = new Date("2026-09-14T00:06:12.000Z");

		updateRunnerHeartbeat(getDb(), runner.id, heartbeat);

		expect(getRunnerById(getDb(), runner.id)).toEqual({ ...runner, lastHeartbeatOn: heartbeat });
	});
});
