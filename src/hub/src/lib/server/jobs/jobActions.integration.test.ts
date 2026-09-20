import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { runnerPoll, uploadJobStepArtifact } from "../runner/runnerActions";
import { useIntegrationTestDb } from "../storage/db/_test/integrationTestDb";
import { JobStatus } from "../storage/db/jobStatus";
import { TranscriptKind } from "../storage/db/jobTranscriptKind";
import { JobType } from "../storage/db/jobType";
import { SensitivityType } from "../storage/db/sensitivityType";
import {
	appendAutoSequencedTranscriptEntry,
	claimNextJobForRunner,
	insertJob,
	insertTrainingRunJobStep,
	upsertJobIngredient,
	upsertJobResult
} from "../storage/repositories/jobRepository";
import { createDraftRecipe, publishRecipe } from "../storage/repositories/recipeRepository";

import { cancelJob, getJobDetail, getJobStepArtifactImage, listJobsAction } from "./jobActions";

import type { RecipeDefinition } from "$lib/types/recipeDefinition";

const SHARED_SECRET = "test-secret";

function seedRegisteredApplication(db: Database.Database, id = 1): number {
	db.exec(`
		INSERT INTO customer (id, name) VALUES (${id}, 'Acme');
		INSERT INTO application (id, name) VALUES (${id}, 'Widgets');
		INSERT INTO customer_application_xref (id, customer_id, application_id) VALUES (${id}, ${id}, ${id});
	`);
	return id;
}

function insertTrainingRunJob(db: Database.Database, xrefId: number) {
	return insertJob(db, {
		jobType: JobType.TrainingRun,
		name: "Training Run",
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

	describe("listJobsAction", () => {
		it("returns every Job", () => {
			const id = seedRegisteredApplication(getDb());
			insertTrainingRunJob(getDb(), id);

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
			const job = insertTrainingRunJob(getDb(), xrefId);

			const result = getJobDetail(getDb(), String(job.id));

			expect(result).toEqual({
				status: 200,
				body: { data: { ...job, transcript: [], results: [], ingredients: [], artifacts: [] } }
			});
		});

		describe("Step transcript rows", () => {
			const now = new Date("2026-09-15T00:03:00.000Z");
			const target = { component: "button", selector: "id='save'" };

			function reportStepRow(jobId: number, stepId: string, parentStepId?: string): void {
				appendAutoSequencedTranscriptEntry(
					getDb(),
					jobId,
					TranscriptKind.Step,
					{ stepId, outcome: "succeeded", ...(parentStepId ? { parentStepId } : {}), targetDescription: target, inputs: [], outputs: [] },
					now
				);
			}

			function transcriptTextOf(jobId: number): unknown[] {
				const detail = getJobDetail(getDb(), String(jobId));
				return (detail.body as { data: { transcript: Array<{ text: unknown }> } }).data.transcript.map((entry) => entry.text);
			}

			it("resolves a Training Run row's action from its stored Step definition, keeping the fields separate", () => {
				const xrefId = seedRegisteredApplication(getDb());
				const job = insertTrainingRunJob(getDb(), xrefId);
				insertTrainingRunJobStep(getDb(), job.id, { id: "click_save", action: "click", args: [{ by: "css", value: "#save" }] }, now);
				reportStepRow(job.id, "click_save");

				expect(transcriptTextOf(job.id)).toEqual([
					{ stepId: "click_save", outcome: "succeeded", action: "click", targetDescription: target, inputs: [], outputs: [] }
				]);
			});

			it("resolves a Recipe Job row's action for top-level, child, and recovery Steps", () => {
				const xrefId = seedRegisteredApplication(getDb());
				const draft = createDraftRecipe(getDb(), {
					customerApplicationXrefId: xrefId,
					name: "Recipe",
					goal: "Goal",
					definition: {
						schemaVersion: 1,
						inputs: {},
						outputs: {},
						steps: [
							{ id: "open_home", action: "open", args: ["https://example.com"] },
							{ id: "form", action: "group", args: [[{ id: "click_save", action: "click", args: [{ by: "css", value: "#save" }] }]] },
							{ id: "done", action: "finish", args: [{ test: "exists", args: [{ by: "css", value: "#done" }] }] }
						],
						recoveries: [
							{
								id: "dismiss_popup",
								description: "Dismiss the popup",
								when: { test: "exists", args: [{ by: "css", value: "#popup" }] },
								steps: [{ id: "click_dismiss", action: "click", args: [{ by: "css", value: "#dismiss" }] }]
							}
						]
					},
					sourceTrainingRunId: null,
					createdAt: now
				});
				const recipe = publishRecipe(getDb(), draft.id, now)!;
				const job = insertJob(getDb(), {
					jobType: JobType.Recipe,
					name: "Sample recipe",
					customerApplicationXrefId: xrefId,
					recipeId: recipe.id,
					mode: "Execute",
					allowlist: "https://example.com",
					stepTimeoutMs: 15000,
					createdAt: now
				});
				reportStepRow(job.id, "open_home");
				reportStepRow(job.id, "click_save", "form");
				reportStepRow(job.id, "click_dismiss", "dismiss_popup");

				expect(transcriptTextOf(job.id)).toEqual([
					expect.objectContaining({ stepId: "open_home", action: "open" }),
					expect.objectContaining({ stepId: "click_save", action: "click", parentStepId: "form" }),
					expect.objectContaining({ stepId: "click_dismiss", action: "click", parentStepId: "dismiss_popup" })
				]);
			});

			it("crashes when a row's stepId resolves to no Step", () => {
				const xrefId = seedRegisteredApplication(getDb());
				const job = insertTrainingRunJob(getDb(), xrefId);
				reportStepRow(job.id, "ghost_step");

				expect(() => getJobDetail(getDb(), String(job.id))).toThrow(/ghost_step/);
			});
		});

		it("never leaks a rawValue key anywhere in its serialized JSON", () => {
			const xrefId = seedRegisteredApplication(getDb());
			const job = insertTrainingRunJob(getDb(), xrefId);
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
			const job = insertTrainingRunJob(getDb(), xrefId);

			const result = cancelJob(getDb(), String(job.id));

			expect(result.status).toBe(200);
			expect((result.body as { data: { jobStatusId: JobStatus } }).data.jobStatusId).toBe(JobStatus.CompletedCancelled);
		});

		it("cancels a Running Job", () => {
			const xrefId = seedRegisteredApplication(getDb());
			const job = insertTrainingRunJob(getDb(), xrefId);
			const { lastInsertRowid: runnerId } = getDb().prepare("INSERT INTO runner (customer_application_xref_id) VALUES (?)").run(xrefId);
			claimNextJobForRunner(getDb(), xrefId, Number(runnerId), new Date("2026-09-15T00:01:00.000Z"));

			const result = cancelJob(getDb(), String(job.id));

			expect(result.status).toBe(200);
			expect((result.body as { data: { jobStatusId: JobStatus } }).data.jobStatusId).toBe(JobStatus.CompletedCancelled);
		});

		it("records a status transcript entry announcing the cancellation", () => {
			const xrefId = seedRegisteredApplication(getDb());
			const job = insertTrainingRunJob(getDb(), xrefId);

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
			const job = insertTrainingRunJob(getDb(), xrefId);
			cancelJob(getDb(), String(job.id));

			const result = cancelJob(getDb(), String(job.id));

			expect(result).toEqual({ status: 409, body: { error: `Job ${job.id} is already in a terminal status` } });
		});
	});

	describe("getJobStepArtifactImage", () => {
		function seedRunner(db: Database.Database): number {
			db.exec(`
				INSERT INTO customer (id, name) VALUES (1, 'Acme');
				INSERT INTO application (id, name) VALUES (1, 'BambooInvoice');
				INSERT INTO customer_application_xref (id, customer_id, application_id) VALUES (1, 1, 1);
				INSERT INTO runner (id, customer_application_xref_id) VALUES (1, 1);
			`);
			return 1;
		}

		const sampleDefinition: RecipeDefinition = {
			schemaVersion: 1,
			inputs: {},
			outputs: {},
			steps: [{ id: "start", action: "open", args: ["https://example.test"] }],
			recoveries: []
		};

		async function createRunningRecipeJobAndUploadArtifact(
			db: Database.Database,
			runnerId: number,
			image: Buffer
		): Promise<{ jobId: number; artifactId: number }> {
			const draft = createDraftRecipe(db, {
				customerApplicationXrefId: 1,
				name: "Sample recipe",
				goal: "Goal",
				definition: sampleDefinition,
				sourceTrainingRunId: null,
				createdAt: new Date("2026-09-15T00:00:00.000Z")
			});
			const recipe = publishRecipe(db, draft.id, new Date("2026-09-15T00:00:01.000Z"))!;
			const job = insertJob(db, {
				jobType: JobType.Recipe,
				name: "Sample recipe",
				customerApplicationXrefId: 1,
				recipeId: recipe.id,
				mode: "Execute",
				allowlist: "https://example.test",
				stepTimeoutMs: 15_000,
				createdAt: new Date("2026-09-15T00:00:02.000Z")
			});
			await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);
			const uploadResult = uploadJobStepArtifact(db, String(runnerId), String(job.id), `Bearer ${SHARED_SECRET}`, SHARED_SECRET, {
				stepId: "start",
				imageBase64: image.toString("base64")
			});
			const artifactId = (uploadResult.body as { data: { id: number } }).data.id;
			return { jobId: job.id, artifactId };
		}

		it("serves back exactly the bytes the Runner uploaded", async () => {
			const db = getDb();
			const runnerId = seedRunner(db);
			const image = Buffer.from("served-back-bytes");
			const { jobId, artifactId } = await createRunningRecipeJobAndUploadArtifact(db, runnerId, image);

			const result = getJobStepArtifactImage(db, String(jobId), String(artifactId));

			expect(result?.image).toEqual(image);
		});

		it("returns undefined for a nonexistent artifact id", () => {
			const db = getDb();
			expect(getJobStepArtifactImage(db, "999", "999")).toBeUndefined();
		});

		it("returns undefined when the artifact exists but belongs to a different Job", async () => {
			const db = getDb();
			const runnerId = seedRunner(db);
			const { jobId: firstJobId, artifactId } = await createRunningRecipeJobAndUploadArtifact(db, runnerId, Buffer.from("job-one-bytes"));
			const { jobId: secondJobId } = await createRunningRecipeJobAndUploadArtifact(db, runnerId, Buffer.from("job-two-bytes"));

			expect(secondJobId).not.toBe(firstJobId);
			expect(getJobStepArtifactImage(db, String(secondJobId), String(artifactId))).toBeUndefined();
		});
	});
});
