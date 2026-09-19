import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { useIntegrationTestDb } from "./db/_test/integrationTestDb";
import { JobType } from "./db/jobType";
import { SensitivityType } from "./db/sensitivityType";
import { insertJob, listSafeJobResults, listTranscriptEntries } from "./repositories/jobRepository";
import { createDraftRecipe, publishRecipe } from "./repositories/recipeRepository";
import { readJobStepArtifact } from "./artifactStorage";
import { reportJobStep, runnerPoll, uploadJobStepArtifact } from "./runnerActions";

import type { RecipeDefinition } from "$lib/types/recipeDefinition";

const SHARED_SECRET = "test-secret";

function seedRunner(db: Database.Database): number {
	db.exec(`
		INSERT INTO customer (id, name) VALUES (1, 'Acme');
		INSERT INTO application (id, name) VALUES (1, 'BambooInvoice');
		INSERT INTO customer_application_xref (id, customer_id, application_id) VALUES (1, 1, 1);
		INSERT INTO runner (id, customer_application_xref_id) VALUES (1, 1);
	`);
	return 1;
}

function sampleDefinition(): RecipeDefinition {
	return {
		schemaVersion: 1,
		inputs: {},
		outputs: {
			accountNumber: { type: "string", description: "Account number", required: true, nullable: true, sensitive: true },
			status: { type: "string", description: "Outcome", required: true, nullable: false, sensitive: false }
		},
		steps: [
			{ id: "start", action: "open", args: ["https://example.test"] },
			{ id: "complete", action: "finish", args: [{ test: "assigned", args: [{ ref: "output", name: "status" }] }] }
		],
		recoveries: []
	};
}

function createRunningRecipeJob(db: Database.Database, runnerId: number): { jobId: number } {
	const draft = createDraftRecipe(db, {
		customerApplicationXrefId: 1,
		name: "Sample recipe",
		goal: "Sample goal",
		definition: sampleDefinition(),
		sourceTrainingRunId: null,
		createdAt: new Date("2026-09-15T00:00:00.000Z")
	});
	const recipe = publishRecipe(db, draft.id, new Date("2026-09-15T00:00:01.000Z"))!;
	const job = insertJob(db, {
		jobType: JobType.Recipe,
		customerApplicationXrefId: 1,
		recipeId: recipe.id,
		mode: "Execute",
		allowlist: "https://example.test",
		stepTimeoutMs: 15_000,
		createdAt: new Date("2026-09-15T00:00:02.000Z")
	});
	runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);
	return { jobId: job.id };
}

describe("reportJobStep DSL-shaped reports (Recipe Jobs)", () => {
	const getDb = useIntegrationTestDb();

	it("persists a transcript row with the field name and outcome only, never the raw extracted value", () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const { jobId } = createRunningRecipeJob(db, runnerId);

		const result = reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			kind: "dslStep",
			stepId: "copy_number",
			parentStepId: "copy_summary",
			outcome: "succeeded",
			extractions: [{ fieldName: "accountNumber", value: "ACCT-9999-SECRET" }]
		});

		expect(result.status).toBe(200);
		const entries = listTranscriptEntries(db, jobId);
		const stepEntry = entries.find((e) => e.sequence > 0);
		expect(stepEntry).toBeDefined();
		expect(JSON.stringify(stepEntry)).not.toContain("ACCT-9999-SECRET");
		expect(stepEntry).toEqual(
			expect.objectContaining({
				text: expect.objectContaining({
					message: expect.stringContaining("copy_summary"),
					inputs: [],
					outputs: [{ fieldName: "accountNumber", safeValue: "••••••", sensitivityType: SensitivityType.Other }]
				})
			})
		);
	});

	it("persists the extracted value as a Job Result through the masked-upsert path", () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const { jobId } = createRunningRecipeJob(db, runnerId);

		reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			kind: "dslStep",
			stepId: "mark_found",
			outcome: "succeeded",
			extractions: [{ fieldName: "status", value: "found" }]
		});

		expect(listSafeJobResults(db, jobId)).toEqual([{ fieldName: "status", safeValue: "found", sensitivityType: SensitivityType.None }]);
	});

	it("rejects an extraction for a field the Recipe doesn't declare as an output", () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const { jobId } = createRunningRecipeJob(db, runnerId);

		const result = reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			kind: "dslStep",
			stepId: "bogus_step",
			outcome: "succeeded",
			extractions: [{ fieldName: "notDeclared", value: "x" }]
		});

		expect(result).toEqual({ status: 400, body: { error: "Unknown output: notDeclared" } });
	});

	it("rejects a dslStep report for a Training Job", () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const job = insertJob(db, {
			jobType: JobType.Training,
			customerApplicationXrefId: 1,
			goal: "Extract",
			startingUrl: "https://example.test",
			allowlist: "https://example.test",
			maxSteps: 5,
			alternateGoals: [],
			syntheticDataConfirmed: false,
			stepTimeoutMs: 15000,
			createdAt: new Date("2026-09-15T00:00:00.000Z")
		});
		runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		const result = reportJobStep(db, String(runnerId), String(job.id), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			kind: "dslStep",
			stepId: "x",
			outcome: "succeeded",
			extractions: []
		});

		expect(result).toEqual({ status: 400, body: { error: "dslStep reporting is Recipe Job-only" } });
	});

	it("rejects a Training-style step report for a Recipe Job", () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const { jobId } = createRunningRecipeJob(db, runnerId);

		const result = reportJobStep(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			kind: "step",
			sequence: 1,
			message: "did a thing",
			inputs: [],
			outputs: []
		});

		expect(result).toEqual({ status: 400, body: { error: "step reporting is Training Job-only" } });
	});
});

describe("uploadJobStepArtifact (Recipe Job screenshots)", () => {
	const getDb = useIntegrationTestDb();

	it("accepts a screenshot for a Step and stores it on disk, recording the pointer", () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const { jobId } = createRunningRecipeJob(db, runnerId);
		const imageBytes = Buffer.from("fake-png-bytes");

		const result = uploadJobStepArtifact(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			stepId: "start",
			imageBase64: imageBytes.toString("base64")
		});

		expect(result.status).toBe(201);
		const artifactId = (result.body as { data: { id: number } }).data.id;
		expect(artifactId).toBeGreaterThan(0);
	});

	it("round-trips the stored bytes back out through artifactStorage", () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const { jobId } = createRunningRecipeJob(db, runnerId);
		const imageBytes = Buffer.from("another-fake-png");

		uploadJobStepArtifact(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			stepId: "complete",
			imageBase64: imageBytes.toString("base64")
		});

		const filePath = `.data/artifacts/customer-1-job-${jobId}-step-complete.png`;
		expect(readJobStepArtifact(filePath)).toEqual(imageBytes);
	});

	it("rejects a screenshot upload for a Training Job", () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const job = insertJob(db, {
			jobType: JobType.Training,
			customerApplicationXrefId: 1,
			goal: "Extract",
			startingUrl: "https://example.test",
			allowlist: "https://example.test",
			maxSteps: 5,
			alternateGoals: [],
			syntheticDataConfirmed: false,
			stepTimeoutMs: 15000,
			createdAt: new Date("2026-09-15T00:00:00.000Z")
		});
		runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		const result = uploadJobStepArtifact(db, String(runnerId), String(job.id), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
			stepId: "start",
			imageBase64: Buffer.from("x").toString("base64")
		});

		expect(result).toEqual({ status: 400, body: { error: "Screenshot artifacts are Recipe Job-only" } });
	});

	it("rejects a malformed upload with 400", () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const { jobId } = createRunningRecipeJob(db, runnerId);

		const result = uploadJobStepArtifact(db, String(runnerId), String(jobId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, { stepId: "" });

		expect(result).toEqual({ status: 400, body: { error: "stepId and imageBase64 are required" } });
	});
});
