import type Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useIntegrationTestDb } from "./db/_test/integrationTestDb";
import { JobType } from "./db/jobType";
import { buildOpenStartingUrlStep, insertJob, insertTrainingJobStep } from "./repositories/jobRepository";
import { deriveNextStep } from "./nextStep";
import { reportJobStep, runnerPoll } from "./runnerActions";

// This suite exercises the generic (kind-independent) auth/lookup/parsing checks in
// reportJobStep — the LLM-driven next-Step generation itself is covered by nextStep.test.ts and
// reportJobStep.outcomes.integration.test.ts, so it's mocked here.
vi.mock("./nextStep", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./nextStep")>();
	return { ...actual, deriveNextStep: vi.fn() };
});

const SHARED_SECRET = "test-secret";

beforeEach(() => {
	vi.mocked(deriveNextStep).mockReset().mockResolvedValue({ id: "s1", action: "click", args: [{ by: "text", value: "Search" }] });
});

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
	const job = insertJob(db, {
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
	});
	insertTrainingJobStep(db, job.id, buildOpenStartingUrlStep(), job.createdAt);
	return job.id;
}

describe("reportJobStep", () => {
	const getDb = useIntegrationTestDb();

	const dslStepBody = (stepId = "s1") => ({
		kind: "dslStep" as const,
		stepId,
		outcome: "succeeded" as const,
		extractions: [] as Array<{ fieldName: string; value: string }>
	});

	it("rejects a missing/incorrect bearer secret", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1);

		const result = await reportJobStep(db, String(runnerId), String(jobId), "Bearer wrong-secret", SHARED_SECRET, dslStepBody());

		expect(result).toEqual({ status: 401, body: { error: "Unauthorized" } });
	});

	it("rejects an unknown runner id", async () => {
		const db = getDb();
		seedRunner(db);
		const jobId = insertPendingJob(db, 1);

		const result = await reportJobStep(db, "999", String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, dslStepBody());

		expect(result).toEqual({ status: 404, body: { error: "Runner 999 not found" } });
	});

	it("rejects an unknown job id", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);

		const result = await reportJobStep(db, String(runnerId), "999", `Bearer ${SHARED_SECRET}`, SHARED_SECRET, dslStepBody());

		expect(result).toEqual({ status: 404, body: { error: "Job 999 not found" } });
	});

	it("rejects a Runner not assigned to the Job with 403", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1);
		await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);
		seedXref(db, 2);
		const otherRunnerId = seedRunnerOnXref(db, 2);

		const result = await reportJobStep(db, String(otherRunnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, dslStepBody());

		expect(result).toEqual({ status: 403, body: { error: `Runner ${otherRunnerId} is not assigned to Job ${jobId}` } });
	});

	it("rejects a missing kind with 400", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1);
		await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		const result = await reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			kind: "",
			message: "did a thing"
		});

		expect(result).toEqual({ status: 400, body: { error: "kind is required" } });
	});

	it("rejects a missing message with 400", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1);
		await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		const result = await reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			kind: "info",
			message: "  "
		});

		expect(result).toEqual({ status: 400, body: { error: "message is required" } });
	});

	it("rejects an unrecognized kind with 400", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1);
		await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		const result = await reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			kind: "bogus",
			message: "did a thing"
		});

		expect(result).toEqual({ status: 400, body: { error: "Unrecognized kind: bogus" } });
	});

	it("rejects a halt kind, since it is not runner-submittable this spec", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1);
		await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		const result = await reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, { kind: "halt" });

		expect(result).toEqual({ status: 400, body: { error: "Unrecognized kind: halt" } });
	});

	it("rejects a status kind whose status is not a valid JobStatus with 400", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1);
		await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		const result = await reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			kind: "status",
			status: 999,
			message: "bogus status"
		});

		expect(result).toEqual({ status: 400, body: { error: "status must be a valid JobStatus" } });
	});

	it("rejects a dslStep submission missing a stepId with 400", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1);
		await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		const result = await reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			kind: "dslStep",
			outcome: "succeeded",
			extractions: []
		});

		expect(result).toEqual({ status: 400, body: { error: "stepId is required" } });
	});

	it("rejects a dslStep submission with malformed extractions with 400", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1);
		await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		const result = await reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			kind: "dslStep",
			stepId: "s1",
			outcome: "succeeded",
			extractions: [{ fieldName: "total" }]
		});

		expect(result).toEqual({ status: 400, body: { error: "extractions must be an array of { fieldName, value }" } });
	});
});
