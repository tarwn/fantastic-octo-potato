import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { useIntegrationTestDb } from "./db/_test/integrationTestDb";
import { getRunnerById } from "./repositories/runnerRepository";
import { runnerInit, runnerPoll } from "./runnerActions";

const SHARED_SECRET = "test-secret";

function seedRunner(db: Database.Database): number {
	db.exec(`
		INSERT INTO customer (id, name) VALUES (1, 'Acme');
		INSERT INTO application (id, name) VALUES (1, 'Widgets');
		INSERT INTO customer_application_xref (id, customer_id, application_id) VALUES (1, 1, 1);
		INSERT INTO runner (id, customer_application_xref_id) VALUES (1, 1);
	`);
	return 1;
}

describe("runnerActions", () => {
	const getDb = useIntegrationTestDb();

	describe("runnerInit", () => {
		it("rejects a missing/incorrect bearer secret without updating the heartbeat", () => {
			const runnerId = seedRunner(getDb());

			const result = runnerInit(getDb(), String(runnerId), "Bearer wrong-secret", SHARED_SECRET, 30, 300);

			expect(result).toEqual({ status: 401, body: { error: "Unauthorized" } });
			expect(getRunnerById(getDb(), runnerId)?.lastHeartbeatOn).toBeNull();
		});

		it("rejects an unknown runner id", () => {
			const result = runnerInit(getDb(), "999", `Bearer ${SHARED_SECRET}`, SHARED_SECRET, 30, 300);

			expect(result).toEqual({ status: 404, body: { error: "Runner 999 not found" } });
		});

		it("rejects a non-numeric runner id, echoing the raw value", () => {
			const result = runnerInit(getDb(), "not-a-number", `Bearer ${SHARED_SECRET}`, SHARED_SECRET, 30, 300);

			expect(result).toEqual({ status: 404, body: { error: "Runner not-a-number not found" } });
		});

		it("records a heartbeat and returns poll interval/intervention timeout on success", () => {
			const runnerId = seedRunner(getDb());

			const result = runnerInit(getDb(), String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, 30, 300);

			expect(result).toEqual({ status: 200, body: { data: { pollIntervalSeconds: 30, interventionTimeoutSeconds: 300 } } });
			expect(getRunnerById(getDb(), runnerId)?.lastHeartbeatOn).toBeInstanceOf(Date);
		});
	});

	describe("runnerPoll", () => {
		it("rejects a missing/incorrect bearer secret", () => {
			const runnerId = seedRunner(getDb());

			const result = runnerPoll(getDb(), String(runnerId), "Bearer wrong-secret", SHARED_SECRET);

			expect(result).toEqual({ status: 401, body: { error: "Unauthorized" } });
		});

		it("rejects an unknown runner id", () => {
			const result = runnerPoll(getDb(), "999", `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

			expect(result).toEqual({ status: 404, body: { error: "Runner 999 not found" } });
		});

		it("records a heartbeat and reports no work available on success", () => {
			const runnerId = seedRunner(getDb());

			const result = runnerPoll(getDb(), String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

			expect(result).toEqual({ status: 200, body: { data: { hasWork: false } } });
			expect(getRunnerById(getDb(), runnerId)?.lastHeartbeatOn).toBeInstanceOf(Date);
		});
	});
});
