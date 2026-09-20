import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { reportJobStep } from "../runner/runnerActions";
import { useIntegrationTestDb } from "../storage/db/_test/integrationTestDb";
import { JobStatus } from "../storage/db/jobStatus";
import { JobType } from "../storage/db/jobType";
import { claimNextJobForRunner, getJobById, insertJob, listTranscriptEntries } from "../storage/repositories/jobRepository";
import { createDraftRecipe, publishRecipe } from "../storage/repositories/recipeRepository";

import { endJob, takeControl } from "./interventionActions";
import { cancelJob, getJobDetail } from "./jobActions";

const SHARED_SECRET = "test-secret";
const AUTH = `Bearer ${SHARED_SECRET}`;
const now = new Date("2026-09-15T00:00:00.000Z");

function seedRecipeJob(db: Database.Database): number {
	db.exec(`
		INSERT INTO customer (id, name) VALUES (1, 'Acme');
		INSERT INTO application (id, name) VALUES (1, 'Widgets');
		INSERT INTO customer_application_xref (id, customer_id, application_id) VALUES (1, 1, 1);
		INSERT INTO runner (id, customer_application_xref_id) VALUES (1, 1);
	`);
	const draft = createDraftRecipe(db, {
		customerApplicationXrefId: 1,
		name: "Recipe",
		goal: "Goal",
		definition: { schemaVersion: 1, inputs: {}, outputs: {}, steps: [{ id: "open_home", action: "open", args: ["https://example.com"] }], recoveries: [] },
		sourceTrainingRunId: null,
		createdAt: now
	});
	publishRecipe(db, draft.id, now);
	const job = insertJob(db, {
		jobType: JobType.Recipe,
		name: "Recipe",
		customerApplicationXrefId: 1,
		recipeId: draft.id,
		mode: "Trial",
		allowlist: "https://example.com",
		stepTimeoutMs: 15000,
		createdAt: now
	});
	claimNextJobForRunner(db, 1, 1, now);
	return job.id;
}

async function requestIntervention(db: Database.Database, jobId: number): Promise<void> {
	await reportJobStep(db, "1", String(jobId), AUTH, SHARED_SECRET, {
		kind: "status",
		status: JobStatus.InterventionRequested,
		message: "Step click_missing failed with no matching recoverable scenario",
		blockedStepId: "click_missing"
	});
}

describe("interventionActions", () => {
	const getDb = useIntegrationTestDb();

	describe("reporting Intervention-Requested", () => {
		it("records the blocked Step id and reason on the Job", async () => {
			const jobId = seedRecipeJob(getDb());

			await requestIntervention(getDb(), jobId);

			const job = getJobById(getDb(), jobId)!;
			expect(job.jobStatusId).toBe(JobStatus.InterventionRequested);
			expect(job.blockedStepId).toBe("click_missing");
			expect(job.blockedReason).toBe("Step click_missing failed with no matching recoverable scenario");
			expect(job.interventionOwner).toBeNull();
		});
	});

	describe("takeControl", () => {
		it("moves an unowned Intervention-Requested Job to Interactive-User with the operator as owner and a Transcript entry", async () => {
			const jobId = seedRecipeJob(getDb());
			await requestIntervention(getDb(), jobId);

			const result = takeControl(getDb(), String(jobId), { operatorId: "op-1" });

			expect(result.status).toBe(200);
			const job = getJobById(getDb(), jobId)!;
			expect(job.jobStatusId).toBe(JobStatus.InteractiveUser);
			expect(job.interventionOwner).toBe("op-1");
			expect(listTranscriptEntries(getDb(), jobId).at(-1)).toMatchObject({ text: "Control taken by operator op-1", jobStatusId: JobStatus.InteractiveUser });
		});

		it("lets exactly one of two takes win; the loser gets 409 and no side effects", async () => {
			const jobId = seedRecipeJob(getDb());
			await requestIntervention(getDb(), jobId);
			const entriesBefore = listTranscriptEntries(getDb(), jobId).length;

			const first = takeControl(getDb(), String(jobId), { operatorId: "op-1" });
			const second = takeControl(getDb(), String(jobId), { operatorId: "op-2" });

			expect([first.status, second.status]).toEqual([200, 409]);
			expect(getJobById(getDb(), jobId)!.interventionOwner).toBe("op-1");
			expect(listTranscriptEntries(getDb(), jobId)).toHaveLength(entriesBefore + 1);
		});

		it("rejects a Job that is not awaiting intervention", () => {
			const jobId = seedRecipeJob(getDb());

			expect(takeControl(getDb(), String(jobId), { operatorId: "op-1" }).status).toBe(409);
		});

		it("rejects a missing operatorId and an unknown Job", () => {
			const jobId = seedRecipeJob(getDb());

			expect(takeControl(getDb(), String(jobId), {}).status).toBe(400);
			expect(takeControl(getDb(), "999", { operatorId: "op-1" }).status).toBe(404);
		});
	});

	describe("endJob", () => {
		it("lets the owner end the Job as Completed-Failed, clearing the owner", async () => {
			const jobId = seedRecipeJob(getDb());
			await requestIntervention(getDb(), jobId);
			takeControl(getDb(), String(jobId), { operatorId: "op-1" });

			const result = endJob(getDb(), String(jobId), { operatorId: "op-1" });

			expect(result.status).toBe(200);
			const job = getJobById(getDb(), jobId)!;
			expect(job.jobStatusId).toBe(JobStatus.CompletedFailed);
			expect(job.interventionOwner).toBeNull();
			expect(job.completedAt).not.toBeNull();
			expect(listTranscriptEntries(getDb(), jobId).at(-1)).toMatchObject({ text: "Job ended by operator op-1", jobStatusId: JobStatus.CompletedFailed });
		});

		it("rejects a non-owner and leaves the Job untouched", async () => {
			const jobId = seedRecipeJob(getDb());
			await requestIntervention(getDb(), jobId);
			takeControl(getDb(), String(jobId), { operatorId: "op-1" });

			const result = endJob(getDb(), String(jobId), { operatorId: "op-2" });

			expect(result.status).toBe(409);
			expect(getJobById(getDb(), jobId)!.jobStatusId).toBe(JobStatus.InteractiveUser);
		});

		it("never revives a cancelled Job", async () => {
			const jobId = seedRecipeJob(getDb());
			await requestIntervention(getDb(), jobId);
			takeControl(getDb(), String(jobId), { operatorId: "op-1" });
			cancelJob(getDb(), String(jobId));

			expect(endJob(getDb(), String(jobId), { operatorId: "op-1" }).status).toBe(409);
			expect(takeControl(getDb(), String(jobId), { operatorId: "op-2" }).status).toBe(409);
			expect(getJobById(getDb(), jobId)!.jobStatusId).toBe(JobStatus.CompletedCancelled);
		});
	});

	describe("Recipe Job cancellation", () => {
		it.each([
			["Intervention-Requested", false],
			["Interactive-User", true]
		])("cancels a Recipe Job that is %s, clearing any owner", async (_label, taken) => {
			const jobId = seedRecipeJob(getDb());
			await requestIntervention(getDb(), jobId);
			if (taken) {
				takeControl(getDb(), String(jobId), { operatorId: "op-1" });
			}

			const result = cancelJob(getDb(), String(jobId));

			expect(result.status).toBe(200);
			const job = getJobById(getDb(), jobId)!;
			expect(job.jobStatusId).toBe(JobStatus.CompletedCancelled);
			expect(job.interventionOwner).toBeNull();
			expect(listTranscriptEntries(getDb(), jobId).at(-1)).toMatchObject({ text: "Cancelled by operator", jobStatusId: JobStatus.CompletedCancelled });
		});

		it("still rejects cancelling a Running Recipe Job with 409", () => {
			const jobId = seedRecipeJob(getDb());

			expect(cancelJob(getDb(), String(jobId)).status).toBe(409);
			expect(getJobById(getDb(), jobId)!.jobStatusId).toBe(JobStatus.Running);
		});
	});

	describe("owner cleared on terminal status", () => {
		it("clears the owner when the Runner reports a terminal status", async () => {
			const jobId = seedRecipeJob(getDb());
			await requestIntervention(getDb(), jobId);
			takeControl(getDb(), String(jobId), { operatorId: "op-1" });

			await reportJobStep(getDb(), "1", String(jobId), AUTH, SHARED_SECRET, {
				kind: "status",
				status: JobStatus.CompletedFailed,
				message: "Interactive session idle timed out"
			});

			const job = getJobById(getDb(), jobId)!;
			expect(job.jobStatusId).toBe(JobStatus.CompletedFailed);
			expect(job.interventionOwner).toBeNull();
		});
	});

	describe("Job detail", () => {
		it("exposes status, owner, and blocked Step/reason to the Hub UI and Runner poll", async () => {
			const jobId = seedRecipeJob(getDb());
			await requestIntervention(getDb(), jobId);
			takeControl(getDb(), String(jobId), { operatorId: "op-1" });

			const body = getJobDetail(getDb(), String(jobId)).body as { data: Record<string, unknown> };

			expect(body.data).toMatchObject({
				jobStatusId: JobStatus.InteractiveUser,
				interventionOwner: "op-1",
				blockedStepId: "click_missing",
				blockedReason: "Step click_missing failed with no matching recoverable scenario"
			});
			expect(Object.keys(body.data).filter((key) => key.toLowerCase().startsWith("raw"))).toEqual([]);
		});
	});
});

describe("interventionActions with a malformed request body", () => {
	const getDb = useIntegrationTestDb();

	it("returns 400 when the body is missing", () => {
		const jobId = seedRecipeJob(getDb());

		expect(takeControl(getDb(), String(jobId), undefined).status).toBe(400);
		expect(endJob(getDb(), String(jobId), undefined).status).toBe(400);
	});
});
