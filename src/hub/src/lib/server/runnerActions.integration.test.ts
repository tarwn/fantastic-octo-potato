import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { useIntegrationTestDb } from "./db/_test/integrationTestDb";
import { JobStatus } from "./db/jobStatus";
import { TranscriptKind } from "./db/jobTranscriptKind";
import { JobType } from "./db/jobType";
import { buildOpenStartingUrlStep, getJobById, insertJob, insertTrainingJobStep, listTranscriptEntries } from "./repositories/jobRepository";
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

		it("records a heartbeat and reports no work available when there's no matching-xref Pending job", () => {
			const runnerId = seedRunner(getDb());

			const result = runnerPoll(getDb(), String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

			expect(result).toEqual({ status: 200, body: { data: { hasWork: false } } });
			expect(getRunnerById(getDb(), runnerId)?.lastHeartbeatOn).toBeInstanceOf(Date);
		});

		it("claims the oldest matching-xref Pending job, handing back the fixed 'open starting URL' first Step", () => {
			const db = getDb();
			const runnerId = seedRunner(db);
			const jobId = insertPendingJob(db, 1);

			const result = runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

			expect(result).toEqual({
				status: 200,
				body: {
					data: {
						hasWork: true,
						job: {
							id: jobId,
							goal: "Extract invoice total",
							alternateGoals: [],
							startingUrl: "https://example.com/start",
							allowlist: "https://example.com",
							maxSteps: 10,
							stepTimeoutMs: 15000,
							syntheticDataConfirmed: false,
							nextStep: {
								id: "open_starting_url",
								action: "open",
								args: [{ ref: "input", name: "startingUrl" }],
								intent: "Open the starting URL"
							}
						}
					}
				}
			});
			expect(getJobById(db, jobId)?.jobStatusId).toBe(JobStatus.Running);
		});

		it("records a status transcript entry announcing the claim", () => {
			const db = getDb();
			const runnerId = seedRunner(db);
			const jobId = insertPendingJob(db, 1);

			runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

			expect(listTranscriptEntries(db, jobId)).toEqual([
				expect.objectContaining({
					sequence: -1,
					kind: TranscriptKind.Status,
					text: `Picked up by Runner ${runnerId}`,
					jobStatusId: JobStatus.Running
				})
			]);
		});

		it("never returns a Pending job belonging to a different xref", () => {
			const db = getDb();
			seedRunner(db);
			insertPendingJob(db, 1);
			seedXref(db, 2);
			const otherXrefRunnerId = seedRunnerOnXref(db, 2);
			const otherXrefJobId = insertPendingJob(db, 2);

			const result = runnerPoll(db, String(otherXrefRunnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

			expect((result.body as { data: { job: { id: number } } }).data.job.id).toBe(otherXrefJobId);
		});
	});
});
