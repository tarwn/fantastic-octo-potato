import type Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildOpenStartingUrlStep } from "../jobs/startingUrlInput";
import { deriveNextStep, NextStepInvalidResponseError } from "../llm/nextStep";
import { compileRecipe, RecipeCompilationInvalidResponseError } from "../llm/recipeCompilation";
import { useIntegrationTestDb } from "../storage/db/_test/integrationTestDb";
import { JobStatus } from "../storage/db/jobStatus";
import { TranscriptKind } from "../storage/db/jobTranscriptKind";
import { JobType } from "../storage/db/jobType";
import { SensitivityType } from "../storage/db/sensitivityType";
import {
	getJobById,
	insertJob,
	insertTrainingRunJobStep,
	listSafeJobResults,
	listTrainingRunJobSteps,
	listTranscriptEntries
} from "../storage/repositories/jobRepository";
import { listRecipesForApplication } from "../storage/repositories/recipeRepository";

import { reportJobStep, runnerPoll, uploadJobStepArtifact } from "./runnerActions";

import type { ChildStep, RecipeDefinition } from "$lib/types/recipeDefinition";

vi.mock("../llm/nextStep", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../llm/nextStep")>();
	return { ...actual, deriveNextStep: vi.fn() };
});

vi.mock("../llm/recipeCompilation", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../llm/recipeCompilation")>();
	return { ...actual, compileRecipe: vi.fn() };
});

const COMPILED_DEFINITION: RecipeDefinition = {
	schemaVersion: 1,
	inputs: {},
	outputs: {},
	steps: [{ id: "s2", action: "finish", args: [{ test: "all", args: [] }] }],
	recoveries: []
};

const SHARED_SECRET = "test-secret";
const CLICK_SEARCH_STEP: ChildStep = { id: "click_search", action: "click", args: [{ by: "text", value: "Search" }] };
const FINISH_STEP: ChildStep = { id: "s2", action: "finish", args: [null] };

beforeEach(() => {
	vi.mocked(deriveNextStep).mockReset().mockResolvedValue(CLICK_SEARCH_STEP);
	vi.mocked(compileRecipe).mockReset().mockResolvedValue(COMPILED_DEFINITION);
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

function insertPendingJob(db: Database.Database, xrefId: number, maxSteps = 10): number {
	const job = insertJob(db, {
		jobType: JobType.TrainingRun,
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
	insertTrainingRunJobStep(db, job.id, buildOpenStartingUrlStep(), job.createdAt);
	return job.id;
}

const dslStepBody = (stepId: string, extractions: Array<{ fieldName: string; value: string }> = []) => ({
	kind: "dslStep" as const,
	stepId,
	outcome: "succeeded" as const,
	extractions
});

describe("reportJobStep outcomes (Training Run Jobs)", () => {
	const getDb = useIntegrationTestDb();

	it("records an info/recover/observe/plan message as a plain-string transcript row without mutating status", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1);
		await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		const result = await reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			kind: "observe",
			message: "Looked at the page"
		});

		expect(result).toEqual({ status: 200, body: { data: { jobStatusId: JobStatus.Running } } });
		expect(listTranscriptEntries(db, jobId)).toContainEqual(
			expect.objectContaining({ kind: TranscriptKind.Observe, text: "Looked at the page", jobStatusId: null })
		);
		expect(getJobById(db, jobId)?.jobStatusId).toBe(JobStatus.Running);
	});

	it("applies a status-kind submission's status change and records it on the transcript row", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1);
		await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		const result = await reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			kind: "status",
			status: JobStatus.CompletedCancelled,
			message: "Cancelled itself"
		});

		expect(result).toEqual({ status: 200, body: { data: { jobStatusId: JobStatus.CompletedCancelled } } });
		expect(getJobById(db, jobId)?.jobStatusId).toBe(JobStatus.CompletedCancelled);
		expect(listTranscriptEntries(db, jobId)).toContainEqual(
			expect.objectContaining({ kind: TranscriptKind.Status, text: "Cancelled itself", jobStatusId: JobStatus.CompletedCancelled })
		);
	});

	it("no-ops and returns the current status without mutating an already-terminal Job", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1, 1);
		await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);
		await reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, dslStepBody("click_search"));

		const result = await reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, dslStepBody("too_late"));

		expect(result).toEqual({ status: 200, body: { data: { jobStatusId: JobStatus.CompletedFailed } } });
	});

	it("sets Completed-Failed once the reported Step count reaches maxSteps", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1, 1);
		await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		const result = await reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, dslStepBody("click_search"));

		expect(result).toEqual({ status: 200, body: { data: { jobStatusId: JobStatus.CompletedFailed } } });
		expect(getJobById(db, jobId)?.jobStatusId).toBe(JobStatus.CompletedFailed);
		expect(listTranscriptEntries(db, jobId)).toContainEqual(
			expect.objectContaining({
				sequence: 2,
				kind: TranscriptKind.Status,
				text: "Reached max steps, marked Completed-Failed",
				jobStatusId: JobStatus.CompletedFailed
			})
		);
	});

	it("sets Completed-Success once the model issues a finish Step", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1, 100);
		await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);
		vi.mocked(deriveNextStep).mockResolvedValueOnce(FINISH_STEP);

		const result = await reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, dslStepBody("click_search"));

		expect(result).toEqual({ status: 200, body: { data: { jobStatusId: JobStatus.CompletedSuccess } } });
		expect(getJobById(db, jobId)?.jobStatusId).toBe(JobStatus.CompletedSuccess);
		expect(listTranscriptEntries(db, jobId)).toContainEqual(
			expect.objectContaining({
				kind: TranscriptKind.Status,
				text: "Model issued a finish Step, marked Completed-Success",
				jobStatusId: JobStatus.CompletedSuccess
			})
		);
	});

	it("compiles and creates a draft Recipe once the model issues a finish Step", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1, 100);
		await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);
		vi.mocked(deriveNextStep).mockResolvedValueOnce(FINISH_STEP);

		await reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, dslStepBody("click_search"));

		const recipes = listRecipesForApplication(db, 1);
		expect(recipes).toHaveLength(1);
		expect(recipes[0]).toEqual(
			expect.objectContaining({ goal: "Extract invoice total", definition: COMPILED_DEFINITION, sourceTrainingRunId: String(jobId) })
		);
	});

	it("records a compilation failure on the transcript and creates no Recipe once retries are exhausted, without flipping the Job off Completed-Success (R007)", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1, 100);
		await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);
		vi.mocked(deriveNextStep).mockResolvedValueOnce(FINISH_STEP);
		vi.mocked(compileRecipe).mockRejectedValueOnce(new RecipeCompilationInvalidResponseError("still invalid"));

		const result = await reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, dslStepBody("click_search"));

		expect(result).toEqual({ status: 200, body: { data: { jobStatusId: JobStatus.CompletedSuccess } } });
		expect(getJobById(db, jobId)?.jobStatusId).toBe(JobStatus.CompletedSuccess);
		expect(listRecipesForApplication(db, 1)).toEqual([]);
		expect(listTranscriptEntries(db, jobId)).toContainEqual(
			expect.objectContaining({ kind: TranscriptKind.Info, text: "Recipe compilation failed: still invalid" })
		);
	});

	it("marks Completed-Error when next-Step generation is exhausted, without a further nextStep", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1, 100);
		await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);
		vi.mocked(deriveNextStep).mockRejectedValueOnce(new NextStepInvalidResponseError("still invalid"));

		const result = await reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, dslStepBody("click_search"));

		expect(result).toEqual({ status: 200, body: { data: { jobStatusId: JobStatus.CompletedError } } });
		expect(getJobById(db, jobId)?.jobStatusId).toBe(JobStatus.CompletedError);
	});

	it("marks Completed-Error when the model reuses an already-used Step id, without inserting a duplicate training_job_step row", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1, 100);
		await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);
		vi.mocked(deriveNextStep).mockResolvedValueOnce({ id: "open_starting_url", action: "click", args: [{ by: "text", value: "Search" }] });

		const result = await reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, dslStepBody("open_starting_url"));

		expect(result).toEqual({ status: 200, body: { data: { jobStatusId: JobStatus.CompletedError } } });
		expect(getJobById(db, jobId)?.jobStatusId).toBe(JobStatus.CompletedError);
		expect(listTrainingRunJobSteps(db, jobId)).toHaveLength(1);
	});

	it("records an extraction as a Job Result, sensitivity None (real classification happens at compile time, Step 6)", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1, 100);
		await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		await reportJobStep(
			db,
			String(runnerId),
			String(jobId),
			`Bearer ${SHARED_SECRET}`,
			SHARED_SECRET,
			dslStepBody("click_search", [{ fieldName: "total", value: "100" }])
		);

		expect(listSafeJobResults(db, jobId)).toEqual([{ fieldName: "total", safeValue: "100", sensitivityType: SensitivityType.None }]);
	});

	it("returns the LLM-generated next Step while the run continues", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1, 100);
		await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);
		const readTotalStep: ChildStep = {
			id: "read_total",
			action: "read",
			args: [{ by: "text", value: "Total" }, "text", { ref: "output", name: "total" }]
		};
		vi.mocked(deriveNextStep).mockResolvedValueOnce(readTotalStep);

		const result = await reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, dslStepBody("click_search"));

		expect(result).toEqual({ status: 200, body: { data: { jobStatusId: JobStatus.Running, nextStep: readTotalStep } } });
	});

	it("persists a derived Step before returning it, so a later transcript row can be correlated back to its action/args", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1, 100);
		await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		await reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, dslStepBody("open_starting_url"));

		expect(listTrainingRunJobSteps(db, jobId)).toEqual([
			expect.objectContaining({ stepId: "open_starting_url" }),
			expect.objectContaining({ stepId: "click_search", definition: CLICK_SEARCH_STEP })
		]);
	});

	it("also persists a model-issued finish Step", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1, 100);
		await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);
		vi.mocked(deriveNextStep).mockResolvedValueOnce(FINISH_STEP);

		await reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, dslStepBody("click_search"));

		expect(listTrainingRunJobSteps(db, jobId)).toContainEqual(expect.objectContaining({ stepId: "s2", definition: FINISH_STEP }));
	});

	it("builds the next-Step prompt with the just-uploaded screenshot for the reported stepId (C004)", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1, 100);
		await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);
		uploadJobStepArtifact(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			stepId: "click_search",
			imageBase64: Buffer.from("masked-png-bytes").toString("base64")
		});

		await reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, dslStepBody("click_search"));

		expect(vi.mocked(deriveNextStep)).toHaveBeenLastCalledWith(
			expect.objectContaining({ maskedScreenshotPngBase64: Buffer.from("masked-png-bytes").toString("base64") })
		);
	});

	it("stores reported credential names (never values) and passes them to the next-Step prompt", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1, 100);
		await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		await reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			...dslStepBody("open_starting_url"),
			credentialNames: ["loginUser", "loginPassword"]
		});

		const job = getJobById(db, jobId);
		expect(job?.jobType === JobType.TrainingRun ? job.details.credentialNames : undefined).toEqual(["loginUser", "loginPassword"]);
		expect(vi.mocked(deriveNextStep)).toHaveBeenLastCalledWith(
			expect.objectContaining({ knownCredentialNames: ["loginUser", "loginPassword"] })
		);
	});

	it("keeps the previously reported credential names on a later report that omits them", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const jobId = insertPendingJob(db, 1, 100);
		await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);
		await reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			...dslStepBody("open_starting_url"),
			credentialNames: ["loginUser"]
		});
		vi.mocked(deriveNextStep).mockResolvedValueOnce(FINISH_STEP);

		await reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, dslStepBody("click_search"));

		expect(vi.mocked(deriveNextStep)).toHaveBeenLastCalledWith(expect.objectContaining({ knownCredentialNames: ["loginUser"] }));
	});
});
