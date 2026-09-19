import type Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useIntegrationTestDb } from "./storage/_test/integrationTestDb";
import { claimNextJobForRunner, insertJob, listTrainingJobSteps, upsertJobIngredient, upsertJobResult } from "./storage/jobRepository";
import { JobStatus } from "./storage/jobStatus";
import { TranscriptKind } from "./storage/jobTranscriptKind";
import { JobType } from "./storage/jobType";
import { SensitivityType } from "./storage/sensitivityType";
import { deriveGoalIngredients } from "./goalIngredients";
import { cancelJob, createJob, getJobDetail, listJobsAction } from "./jobActions";

// createJob calls the LLM to derive Ingredients before persisting the Job — stub it here so this
// integration test exercises the DB/action wiring without needing real LLM config (that's
// goalIngredients.test.ts's job).
vi.mock("./goalIngredients", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./goalIngredients")>();
	return { ...actual, deriveGoalIngredients: vi.fn() };
});

function seedRegisteredApplication(db: Database.Database, id = 1): number {
	db.exec(`
		INSERT INTO customer (id, name) VALUES (${id}, 'Acme');
		INSERT INTO application (id, name) VALUES (${id}, 'Widgets');
		INSERT INTO customer_application_xref (id, customer_id, application_id) VALUES (${id}, ${id}, ${id});
	`);
	return id;
}

function insertTrainingJob(db: Database.Database, xrefId: number) {
	return insertJob(db, {
		jobType: JobType.Training,
		customerApplicationXrefId: xrefId,
		goal: "Goal",
		startingUrl: "https://example.com/start",
		allowlist: "https://example.com",
		maxSteps: 5,
		alternateGoals: [],
		syntheticDataConfirmed: false,
		stepTimeoutMs: 15000,
		createdAt: new Date("2026-09-15T00:00:00.000Z")
	});
}

describe("jobActions", () => {
	const getDb = useIntegrationTestDb();

	beforeEach(() => {
		vi.mocked(deriveGoalIngredients).mockReset().mockResolvedValue([]);
	});

	describe("createJob", () => {
		it("rejects an unknown Registered Application", async () => {
			const result = await createJob(getDb(), "999", { goal: "Goal", startingUrl: "https://example.com/start", maxSteps: 5 });

			expect(result).toEqual({ status: 404, body: { error: "Registered Application 999 not found" } });
		});

		it("rejects a missing goal", async () => {
			const id = seedRegisteredApplication(getDb());

			const result = await createJob(getDb(), String(id), { goal: "  ", startingUrl: "https://example.com/start", maxSteps: 5 });

			expect(result).toEqual({ status: 400, body: { error: "goal is required" } });
		});

		it("rejects an invalid starting URL", async () => {
			const id = seedRegisteredApplication(getDb());

			const result = await createJob(getDb(), String(id), { goal: "Goal", startingUrl: "not-a-url", maxSteps: 5 });

			expect(result).toEqual({ status: 400, body: { error: "startingUrl must be a valid URL" } });
		});

		it("rejects a non-positive maxSteps", async () => {
			const id = seedRegisteredApplication(getDb());

			const result = await createJob(getDb(), String(id), { goal: "Goal", startingUrl: "https://example.com/start", maxSteps: 0 });

			expect(result).toEqual({ status: 400, body: { error: "maxSteps must be a positive integer" } });
		});

		it("creates a Pending Training Job with the allowlist derived from the starting URL's origin", async () => {
			const id = seedRegisteredApplication(getDb());

			const result = await createJob(getDb(), String(id), {
				goal: "Extract invoice total",
				startingUrl: "https://example.com/start?x=1",
				maxSteps: 5
			});

			expect(result.status).toBe(201);
			expect(result.body).toEqual({
				data: expect.objectContaining({
					customerApplicationXrefId: id,
					jobType: JobType.Training,
					jobStatusId: JobStatus.Pending,
					details: {
						goal: "Extract invoice total",
						startingUrl: "https://example.com/start?x=1",
						allowlist: "https://example.com",
						maxSteps: 5,
						alternateGoals: [],
						syntheticDataConfirmed: false,
						stepTimeoutMs: 15000,
						credentialNames: []
					}
				})
			});
		});

		it("persists the fixed 'open starting URL' first Step at creation, before any Runner claims the Job", async () => {
			const id = seedRegisteredApplication(getDb());

			const result = await createJob(getDb(), String(id), {
				goal: "Extract invoice total",
				startingUrl: "https://example.com/start",
				maxSteps: 5
			});
			const job = (result.body as { data: { id: number } }).data;

			expect(listTrainingJobSteps(getDb(), job.id)).toEqual([
				expect.objectContaining({
					stepId: "open_starting_url",
					definition: { id: "open_starting_url", action: "open", args: [{ ref: "input", name: "startingUrl" }], intent: "Open the starting URL" }
				})
			]);
		});

		it("passes through alternate goals and the synthetic-data confirmation from the request body", async () => {
			const id = seedRegisteredApplication(getDb());

			const result = await createJob(getDb(), String(id), {
				goal: "Extract invoice total",
				startingUrl: "https://example.com/start?x=1",
				maxSteps: 5,
				alternateGoals: ["Also capture the due date", "  ", 42],
				syntheticDataConfirmed: true
			});

			expect(result.status).toBe(201);
			expect(result.body).toEqual({
				data: expect.objectContaining({
					details: expect.objectContaining({
						alternateGoals: ["Also capture the due date"],
						syntheticDataConfirmed: true
					})
				})
			});
		});

		it("persists the Ingredients the LLM derives from the goal before the Job is returned", async () => {
			vi.mocked(deriveGoalIngredients).mockResolvedValue([
				{ name: "accountNumber", value: "ACCT-1042", type: "string", sensitive: true }
			]);
			const id = seedRegisteredApplication(getDb());

			const result = await createJob(getDb(), String(id), {
				goal: "Look up account ACCT-1042",
				startingUrl: "https://example.com/start",
				maxSteps: 5
			});
			const job = (result.body as { data: { id: number } }).data;

			const detail = getJobDetail(getDb(), String(job.id));
			expect((detail.body as { data: { ingredients: unknown[] } }).data.ingredients).toEqual([
				expect.objectContaining({ fieldName: "accountNumber", sensitivityType: SensitivityType.PII }),
				expect.objectContaining({ fieldName: "startingUrl" })
			]);
		});

		it("surfaces an exhausted-retry LLM response as a submit error with no Job created", async () => {
			const { GoalIngredientsInvalidResponseError } = await import("./goalIngredients");
			vi.mocked(deriveGoalIngredients).mockRejectedValue(new GoalIngredientsInvalidResponseError("still invalid"));
			const id = seedRegisteredApplication(getDb());

			const result = await createJob(getDb(), String(id), {
				goal: "Extract invoice total",
				startingUrl: "https://example.com/start",
				maxSteps: 5
			});

			expect(result).toEqual({ status: 502, body: { error: "still invalid" } });
			expect(listJobsAction(getDb()).body).toEqual({ data: [] });
		});

		it("records a status transcript entry announcing the new Pending Job", async () => {
			const id = seedRegisteredApplication(getDb());

			const result = await createJob(getDb(), String(id), { goal: "Goal", startingUrl: "https://example.com/start", maxSteps: 5 });
			const job = (result.body as { data: { id: number } }).data;

			const detail = getJobDetail(getDb(), String(job.id));
			expect((detail.body as { data: { transcript: unknown[] } }).data.transcript).toEqual([
				expect.objectContaining({
					sequence: -2,
					kind: TranscriptKind.Status,
					text: "Job created, queued for a Runner",
					jobStatusId: JobStatus.Pending
				})
			]);
		});
	});

	describe("listJobsAction", () => {
		it("returns every Job", () => {
			const id = seedRegisteredApplication(getDb());
			insertTrainingJob(getDb(), id);

			const result = listJobsAction(getDb());

			expect(result.status).toBe(200);
			expect((result.body as { data: unknown[] }).data).toHaveLength(1);
		});
	});

	describe("getJobDetail", () => {
		it("returns 404 for an unknown Job", () => {
			expect(getJobDetail(getDb(), "999")).toEqual({ status: 404, body: { error: "Job 999 not found" } });
		});

		it("returns the Job with its transcript, results, and ingredients", () => {
			const xrefId = seedRegisteredApplication(getDb());
			const job = insertTrainingJob(getDb(), xrefId);

			const result = getJobDetail(getDb(), String(job.id));

			expect(result).toEqual({
				status: 200,
				body: { data: { ...job, transcript: [], results: [], ingredients: [], artifacts: [] } }
			});
		});

		it("never leaks a rawValue key anywhere in its serialized JSON", () => {
			const xrefId = seedRegisteredApplication(getDb());
			const job = insertTrainingJob(getDb(), xrefId);
			upsertJobIngredient(getDb(), job.id, "ssn", "123-45-6789", SensitivityType.PII, new Date("2026-09-15T00:01:00.000Z"));
			upsertJobResult(getDb(), job.id, "total", "10.00", SensitivityType.PII, new Date("2026-09-15T00:02:00.000Z"));

			const result = getJobDetail(getDb(), String(job.id));

			expect(JSON.stringify(result.body)).not.toContain("rawValue");
			expect(JSON.stringify(result.body)).not.toContain("123-45-6789");
			expect(JSON.stringify(result.body)).not.toContain("\"10.00\"");
		});
	});

	describe("cancelJob", () => {
		it("returns 404 for an unknown Job", () => {
			expect(cancelJob(getDb(), "999")).toEqual({ status: 404, body: { error: "Job 999 not found" } });
		});

		it("cancels a Pending Job", () => {
			const xrefId = seedRegisteredApplication(getDb());
			const job = insertTrainingJob(getDb(), xrefId);

			const result = cancelJob(getDb(), String(job.id));

			expect(result.status).toBe(200);
			expect((result.body as { data: { jobStatusId: JobStatus } }).data.jobStatusId).toBe(JobStatus.CompletedCancelled);
		});

		it("cancels a Running Job", () => {
			const xrefId = seedRegisteredApplication(getDb());
			const job = insertTrainingJob(getDb(), xrefId);
			const { lastInsertRowid: runnerId } = getDb().prepare("INSERT INTO runner (customer_application_xref_id) VALUES (?)").run(xrefId);
			claimNextJobForRunner(getDb(), xrefId, Number(runnerId), new Date("2026-09-15T00:01:00.000Z"));

			const result = cancelJob(getDb(), String(job.id));

			expect(result.status).toBe(200);
			expect((result.body as { data: { jobStatusId: JobStatus } }).data.jobStatusId).toBe(JobStatus.CompletedCancelled);
		});

		it("records a status transcript entry announcing the cancellation", () => {
			const xrefId = seedRegisteredApplication(getDb());
			const job = insertTrainingJob(getDb(), xrefId);

			cancelJob(getDb(), String(job.id));

			const detail = getJobDetail(getDb(), String(job.id));
			expect((detail.body as { data: { transcript: unknown[] } }).data.transcript).toEqual([
				expect.objectContaining({
					sequence: 6,
					kind: TranscriptKind.Status,
					text: "Cancelled by operator",
					jobStatusId: JobStatus.CompletedCancelled
				})
			]);
		});

		it("rejects cancelling an already-terminal Job with 409", () => {
			const xrefId = seedRegisteredApplication(getDb());
			const job = insertTrainingJob(getDb(), xrefId);
			cancelJob(getDb(), String(job.id));

			const result = cancelJob(getDb(), String(job.id));

			expect(result).toEqual({ status: 409, body: { error: `Job ${job.id} is already in a terminal status` } });
		});
	});
});
