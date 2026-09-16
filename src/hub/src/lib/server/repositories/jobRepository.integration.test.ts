import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { useIntegrationTestDb } from "../db/_test/integrationTestDb";
import { JobStatus } from "../db/jobStatus";
import { JobType } from "../db/jobType";

import {
	claimNextJobForRunner,
	getJobById,
	insertJob,
	listJobs,
	listRunningJobIdsByRunnerId,
	updateJobHeartbeat,
	updateJobStatus
} from "./jobRepository";

function seedXref(db: Database.Database, id = 1): void {
	db.exec(`
		INSERT INTO customer (id, name) VALUES (${id}, 'Acme');
		INSERT INTO application (id, name) VALUES (${id}, 'Widgets');
		INSERT INTO customer_application_xref (id, customer_id, application_id) VALUES (${id}, ${id}, ${id});
	`);
}

function seedRunner(db: Database.Database, xrefId: number): number {
	const { lastInsertRowid } = db.prepare("INSERT INTO runner (customer_application_xref_id) VALUES (?)").run(xrefId);
	return Number(lastInsertRowid);
}

function insertPendingTrainingJob(db: Database.Database, xrefId: number): number {
	const job = insertJob(db, {
		jobType: JobType.Training,
		customerApplicationXrefId: xrefId,
		goal: "Extract invoice total",
		startingUrl: "https://example.com/start",
		allowlist: "https://example.com",
		maxSteps: 10,
		createdAt: new Date("2026-09-15T00:00:00.000Z")
	});
	return job.id;
}

describe("jobRepository", () => {
	const getDb = useIntegrationTestDb();

	describe("insertJob / getJobById", () => {
		it("inserts a Pending Training Job with its details nested under a Training-tagged union, and reads it back", () => {
			seedXref(getDb());

			const job = insertJob(getDb(), {
				jobType: JobType.Training,
				customerApplicationXrefId: 1,
				goal: "Extract invoice total",
				startingUrl: "https://example.com/start",
				allowlist: "https://example.com",
				maxSteps: 10,
				createdAt: new Date("2026-09-15T00:00:00.000Z")
			});

			expect(job).toEqual({
				id: job.id,
				customerApplicationXrefId: 1,
				jobType: JobType.Training,
				jobStatusId: JobStatus.Pending,
				runnerId: null,
				createdAt: new Date("2026-09-15T00:00:00.000Z"),
				startedAt: null,
				heartbeatOn: null,
				completedAt: null,
				details: {
					goal: "Extract invoice total",
					startingUrl: "https://example.com/start",
					allowlist: "https://example.com",
					maxSteps: 10
				}
			});
			expect(getJobById(getDb(), job.id)).toEqual(job);
		});

		it("writes only to the training_job extension table for a Training Job, leaving recipe_job empty", () => {
			seedXref(getDb());
			const jobId = insertPendingTrainingJob(getDb(), 1);

			const trainingRows = getDb().prepare("SELECT job_id FROM training_job WHERE job_id = ?").all(jobId);
			const recipeRows = getDb().prepare("SELECT job_id FROM recipe_job").all();

			expect(trainingRows).toHaveLength(1);
			expect(recipeRows).toHaveLength(0);
		});

		it("inserts a Recipe Job, writing only to the recipe_job extension table", () => {
			seedXref(getDb());

			const job = insertJob(getDb(), {
				jobType: JobType.Recipe,
				customerApplicationXrefId: 1,
				recipeId: null,
				createdAt: new Date("2026-09-15T00:00:00.000Z")
			});

			expect(job).toEqual({
				id: job.id,
				customerApplicationXrefId: 1,
				jobType: JobType.Recipe,
				jobStatusId: JobStatus.Pending,
				runnerId: null,
				createdAt: new Date("2026-09-15T00:00:00.000Z"),
				startedAt: null,
				heartbeatOn: null,
				completedAt: null,
				details: { recipeId: null }
			});
			expect(getJobById(getDb(), job.id)).toEqual(job);
			const trainingRows = getDb().prepare("SELECT job_id FROM training_job WHERE job_id = ?").all(job.id);
			expect(trainingRows).toHaveLength(0);
		});
	});

	it("lists jobs newest first", () => {
		seedXref(getDb());
		const firstId = insertPendingTrainingJob(getDb(), 1);
		const secondId = insertPendingTrainingJob(getDb(), 1);

		expect(listJobs(getDb()).map((job) => job.id)).toEqual([secondId, firstId]);
	});

	it("claims the oldest Pending job for a matching-xref Runner, exactly once", () => {
		const db = getDb();
		seedXref(db);
		const runnerId = seedRunner(db, 1);
		const jobId = insertPendingTrainingJob(db, 1);
		const now = new Date("2026-09-15T00:05:00.000Z");

		const firstClaim = claimNextJobForRunner(db, 1, runnerId, now);
		const secondClaim = claimNextJobForRunner(db, 1, runnerId, now);

		expect(firstClaim).toEqual({
			id: jobId,
			customerApplicationXrefId: 1,
			jobType: JobType.Training,
			jobStatusId: JobStatus.Running,
			runnerId,
			createdAt: new Date("2026-09-15T00:00:00.000Z"),
			startedAt: now,
			heartbeatOn: now,
			completedAt: null,
			details: {
				goal: "Extract invoice total",
				startingUrl: "https://example.com/start",
				allowlist: "https://example.com",
				maxSteps: 10
			}
		});
		expect(secondClaim).toBeUndefined();
	});

	it("never claims a job for a Runner on a different xref", () => {
		const db = getDb();
		seedXref(db, 1);
		seedXref(db, 2);
		const otherXrefRunnerId = seedRunner(db, 2);
		insertPendingTrainingJob(db, 1);

		expect(claimNextJobForRunner(db, 2, otherXrefRunnerId, new Date("2026-09-15T00:05:00.000Z"))).toBeUndefined();
	});

	it("updates heartbeat_on", () => {
		const db = getDb();
		seedXref(db);
		const jobId = insertPendingTrainingJob(db, 1);
		const heartbeat = new Date("2026-09-15T00:10:00.000Z");

		updateJobHeartbeat(db, jobId, heartbeat);

		expect(getJobById(db, jobId)?.heartbeatOn).toEqual(heartbeat);
	});

	it("updates status and completed_at", () => {
		const db = getDb();
		seedXref(db);
		const jobId = insertPendingTrainingJob(db, 1);
		const completedAt = new Date("2026-09-15T00:15:00.000Z");

		updateJobStatus(db, jobId, JobStatus.CompletedSuccess, completedAt);

		const job = getJobById(db, jobId);
		expect(job?.jobStatusId).toBe(JobStatus.CompletedSuccess);
		expect(job?.completedAt).toEqual(completedAt);
	});

	it("no-ops a status update once the job is already terminal", () => {
		const db = getDb();
		seedXref(db);
		const jobId = insertPendingTrainingJob(db, 1);
		const firstCompletedAt = new Date("2026-09-15T00:15:00.000Z");
		updateJobStatus(db, jobId, JobStatus.CompletedFailed, firstCompletedAt);

		updateJobStatus(db, jobId, JobStatus.CompletedCancelled, new Date("2026-09-15T00:20:00.000Z"));

		const job = getJobById(db, jobId);
		expect(job?.jobStatusId).toBe(JobStatus.CompletedFailed);
		expect(job?.completedAt).toEqual(firstCompletedAt);
	});

	it("maps only Runners with a currently-Running job, ignoring Pending/idle Runners", () => {
		const db = getDb();
		seedXref(db);
		const runningRunnerId = seedRunner(db, 1);
		const idleRunnerId = seedRunner(db, 1);
		const jobId = insertPendingTrainingJob(db, 1);
		claimNextJobForRunner(db, 1, runningRunnerId, new Date("2026-09-15T00:05:00.000Z"));

		const result = listRunningJobIdsByRunnerId(db, [runningRunnerId, idleRunnerId]);

		expect(result).toEqual(new Map([[runningRunnerId, jobId]]));
	});

	it("returns an empty map for no Runner ids", () => {
		expect(listRunningJobIdsByRunnerId(getDb(), [])).toEqual(new Map());
	});
});
