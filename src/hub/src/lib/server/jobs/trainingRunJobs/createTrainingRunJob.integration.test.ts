import type Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deriveGoalIngredients } from "../../llm/goalIngredients";
import { useIntegrationTestDb } from "../../storage/db/_test/integrationTestDb";
import { JobStatus } from "../../storage/db/jobStatus";
import { TranscriptKind } from "../../storage/db/jobTranscriptKind";
import { JobType } from "../../storage/db/jobType";
import { SensitivityType } from "../../storage/db/sensitivityType";
import { listTrainingRunJobSteps } from "../../storage/repositories/jobRepository";
import { getJobDetail, listJobsAction } from "../jobActions";

import { createTrainingRunJob } from "./createTrainingRunJob";

// createTrainingRunJob calls the LLM to derive Ingredients before persisting the Job — stub it
// here so this integration test exercises the DB/action wiring without needing real LLM config
// (that's goalIngredients.test.ts's job).
vi.mock("../../llm/goalIngredients", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../llm/goalIngredients")>();
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

describe("createTrainingRunJob", () => {
	const getDb = useIntegrationTestDb();

	beforeEach(() => {
		vi.mocked(deriveGoalIngredients).mockReset().mockResolvedValue([]);
	});

	it("rejects an unknown Registered Application", async () => {
		const result = await createTrainingRunJob(getDb(), "999", { goal: "Goal", startingUrl: "https://example.com/start", maxSteps: 5 });

		expect(result).toEqual({ status: 404, body: { error: "Registered Application 999 not found" } });
	});

	it("rejects a missing goal", async () => {
		const id = seedRegisteredApplication(getDb());

		const result = await createTrainingRunJob(getDb(), String(id), { goal: "  ", startingUrl: "https://example.com/start", maxSteps: 5 });

		expect(result).toEqual({ status: 400, body: { error: "goal is required" } });
	});

	it("rejects an invalid starting URL", async () => {
		const id = seedRegisteredApplication(getDb());

		const result = await createTrainingRunJob(getDb(), String(id), { goal: "Goal", startingUrl: "not-a-url", maxSteps: 5 });

		expect(result).toEqual({ status: 400, body: { error: "startingUrl must be a valid URL" } });
	});

	it("rejects a non-positive maxSteps", async () => {
		const id = seedRegisteredApplication(getDb());

		const result = await createTrainingRunJob(getDb(), String(id), { goal: "Goal", startingUrl: "https://example.com/start", maxSteps: 0 });

		expect(result).toEqual({ status: 400, body: { error: "maxSteps must be a positive integer" } });
	});

	it("creates a Pending Training Run Job with the allowlist derived from the starting URL's origin", async () => {
		const id = seedRegisteredApplication(getDb());

		const result = await createTrainingRunJob(getDb(), String(id), {
			goal: "Extract invoice total",
			startingUrl: "https://example.com/start?x=1",
			maxSteps: 5
		});

		expect(result.status).toBe(201);
		expect(result.body).toEqual({
			data: expect.objectContaining({
				customerApplicationXrefId: id,
				jobType: JobType.TrainingRun,
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

	it("names the Job 'Training Run'", async () => {
		const id = seedRegisteredApplication(getDb());

		const result = await createTrainingRunJob(getDb(), String(id), {
			goal: "Extract invoice total",
			startingUrl: "https://example.com/start",
			maxSteps: 5
		});

		expect(result.body).toEqual({ data: expect.objectContaining({ name: "Training Run" }) });
	});

	it("persists the fixed 'open starting URL' first Step at creation, before any Runner claims the Job", async () => {
		const id = seedRegisteredApplication(getDb());

		const result = await createTrainingRunJob(getDb(), String(id), {
			goal: "Extract invoice total",
			startingUrl: "https://example.com/start",
			maxSteps: 5
		});
		const job = (result.body as { data: { id: number } }).data;

		expect(listTrainingRunJobSteps(getDb(), job.id)).toEqual([
			expect.objectContaining({
				stepId: "open_starting_url",
				definition: { id: "open_starting_url", action: "open", args: [{ ref: "input", name: "startingUrl" }], intent: "Open the starting URL" }
			})
		]);
	});

	it("passes through alternate goals and the synthetic-data confirmation from the request body", async () => {
		const id = seedRegisteredApplication(getDb());

		const result = await createTrainingRunJob(getDb(), String(id), {
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

		const result = await createTrainingRunJob(getDb(), String(id), {
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
		const { GoalIngredientsInvalidResponseError } = await import("../../llm/goalIngredients");
		vi.mocked(deriveGoalIngredients).mockRejectedValue(new GoalIngredientsInvalidResponseError("still invalid"));
		const id = seedRegisteredApplication(getDb());

		const result = await createTrainingRunJob(getDb(), String(id), {
			goal: "Extract invoice total",
			startingUrl: "https://example.com/start",
			maxSteps: 5
		});

		expect(result).toEqual({ status: 502, body: { error: "still invalid" } });
		expect(listJobsAction(getDb()).body).toEqual({ data: [] });
	});

	it("records a status transcript entry announcing the new Pending Job", async () => {
		const id = seedRegisteredApplication(getDb());

		const result = await createTrainingRunJob(getDb(), String(id), { goal: "Goal", startingUrl: "https://example.com/start", maxSteps: 5 });
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
