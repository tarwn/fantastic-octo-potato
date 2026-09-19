import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { useIntegrationTestDb } from "./db/_test/integrationTestDb";
import { JobType } from "./db/jobType";
import { insertJob } from "./repositories/jobRepository";
import { reportJobStep, runnerPoll } from "./runnerActions";

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

function seedRunnerOnXref(db: Database.Database, xrefId: number): number {
	const { lastInsertRowid } = db.prepare("INSERT INTO runner (customer_application_xref_id) VALUES (?)").run(xrefId);
	return Number(lastInsertRowid);
}

function seedXref(db: Database.Database, id: number): void {
	db.exec(`
		INSERT INTO customer (id, name) VALUES (${id}, 'Acme ${id}');
		INSERT INTO application (id, name) VALUES (${id}, 'Widgets ${id}');
		INSERT INTO customer_application_xref (id, customer_id, application_id) VALUES (${id}, ${id}, ${id});
	`);
}

function insertPendingJob(db: Database.Database, xrefId: number, maxSteps = 10): number {
	return insertJob(db, {
		jobType: JobType.Training,
		customerApplicationXrefId: xrefId,
		goal: "Extract invoice total",
		startingUrl: "https://example.com/start",
		allowlist: "https://example.com",
		maxSteps,
		alternateGoals: [],
		syntheticDataConfirmed: false,
		stepTimeoutMs: 15000,
		createdAt: new Date("2026-09-15T00:00:00.000Z")
	}).id;
}

describe("reportJobStep", () => {
	const getDb = useIntegrationTestDb();

	const emptyStepBody = (sequence: number, message = "did a thing") => ({
		kind: "step" as const,
		sequence,
		message,
		inputs: [] as string[],
		outputs: [] as Array<{ fieldName: string; value: string }>
	});

	it("rejects a missing/incorrect bearer secret", () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1);

		const result = reportJobStep(db, String(runnerId), String(jobId), "Bearer wrong-secret", SHARED_SECRET, emptyStepBody(1));

		expect(result).toEqual({ status: 401, body: { error: "Unauthorized" } });
	});

	it("rejects an unknown runner id", () => {
		const db = getDb();
		seedRunner(db);
		const jobId = insertPendingJob(db, 1);

		const result = reportJobStep(db, "999", String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, emptyStepBody(1));

		expect(result).toEqual({ status: 404, body: { error: "Runner 999 not found" } });
	});

	it("rejects an unknown job id", () => {
		const db = getDb();
		const runnerId = seedRunner(db);

		const result = reportJobStep(db, String(runnerId), "999", `Bearer ${SHARED_SECRET}`, SHARED_SECRET, emptyStepBody(1));

		expect(result).toEqual({ status: 404, body: { error: "Job 999 not found" } });
	});

	it("rejects a Runner not assigned to the Job with 403", () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1);
		runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);
		seedXref(db, 2);
		const otherRunnerId = seedRunnerOnXref(db, 2);

		const result = reportJobStep(db, String(otherRunnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, emptyStepBody(1));

		expect(result).toEqual({ status: 403, body: { error: `Runner ${otherRunnerId} is not assigned to Job ${jobId}` } });
	});

	it("rejects a non-positive-integer sequence with 400", () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1);
		runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		const result = reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, emptyStepBody(0));

		expect(result).toEqual({ status: 400, body: { error: "sequence must be a positive integer" } });
	});

	it("rejects a missing kind with 400", () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1);
		runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		const result = reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			sequence: 1,
			kind: "",
			message: "did a thing"
		});

		expect(result).toEqual({ status: 400, body: { error: "kind is required" } });
	});

	it("rejects a missing message with 400", () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1);
		runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		const result = reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, emptyStepBody(1, "  "));

		expect(result).toEqual({ status: 400, body: { error: "message is required" } });
	});

	it("rejects an unrecognized kind with 400", () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1);
		runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		const result = reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			sequence: 1,
			kind: "bogus",
			message: "did a thing"
		});

		expect(result).toEqual({ status: 400, body: { error: "Unrecognized kind: bogus" } });
	});

	it("rejects a halt kind, since it is not runner-submittable this spec", () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1);
		runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		const result = reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, { kind: "halt" });

		expect(result).toEqual({ status: 400, body: { error: "Unrecognized kind: halt" } });
	});

	it("rejects a status kind whose status is not a valid JobStatus with 400", () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1);
		runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		const result = reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			kind: "status",
			status: 999,
			message: "bogus status"
		});

		expect(result).toEqual({ status: 400, body: { error: "status must be a valid JobStatus" } });
	});

	it("rejects a step submission whose inputs is not an array of strings with 400", () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1);
		runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		const result = reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			kind: "step",
			sequence: 1,
			message: "did a thing",
			inputs: [123],
			outputs: []
		});

		expect(result).toEqual({ status: 400, body: { error: "inputs must be an array of field names" } });
	});

	it("rejects a step submission whose outputs entries are malformed with 400", () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1);
		runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		const result = reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			kind: "step",
			sequence: 1,
			message: "did a thing",
			inputs: [],
			outputs: [{ fieldName: "total" }]
		});

		expect(result).toEqual({ status: 400, body: { error: "outputs must be an array of { fieldName, value }" } });
	});

	it("rejects a step submission whose inputs name an unknown ingredient with 400", () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1);
		runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		const result = reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			kind: "step",
			sequence: 1,
			message: "did a thing",
			inputs: ["missing_field"],
			outputs: []
		});

		expect(result).toEqual({ status: 400, body: { error: "Unknown ingredient: missing_field" } });
	});
});
