import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { getPendingCommand, reportCommandResult } from "../runner/interventionCommandActions";
import { reportJobStep } from "../runner/runnerActions";
import { useIntegrationTestDb } from "../storage/db/_test/integrationTestDb";
import { JobStatus } from "../storage/db/jobStatus";
import { JobType } from "../storage/db/jobType";
import { claimNextJobForRunner, insertJob, listTranscriptEntries } from "../storage/repositories/jobRepository";
import { createDraftRecipe, publishRecipe } from "../storage/repositories/recipeRepository";

import { endJob, submitCommand, takeControl } from "./interventionActions";
import { cancelJob, getJobDetail } from "./jobActions";

const SHARED_SECRET = "test-secret";
const AUTH = `Bearer ${SHARED_SECRET}`;
const now = new Date("2026-09-15T00:00:00.000Z");
const RESULT_BODY = { outcome: "succeeded", targetDescription: { component: "element", selector: "" } };

function seedRecipeJob(db: Database.Database): number {
	db.exec(`
		INSERT INTO customer (id, name) VALUES (1, 'Acme');
		INSERT INTO application (id, name) VALUES (1, 'Widgets');
		INSERT INTO customer_application_xref (id, customer_id, application_id) VALUES (1, 1, 1);
		INSERT INTO runner (id, customer_application_xref_id) VALUES (1, 1);
		INSERT INTO runner (id, customer_application_xref_id) VALUES (2, 1);
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

async function seedInteractiveJob(db: Database.Database): Promise<number> {
	const jobId = seedRecipeJob(db);
	await reportJobStep(db, "1", String(jobId), AUTH, SHARED_SECRET, {
		kind: "status",
		status: JobStatus.InterventionRequested,
		message: "Step click_missing failed",
		blockedStepId: "click_missing"
	});
	takeControl(db, String(jobId), { operatorId: "op-1" });
	return jobId;
}

const click = (overrides: Record<string, unknown> = {}) => ({ operatorId: "op-1", commandKey: "key-1", kind: "click", x: 10, y: 20, ...overrides });

describe("interventionCommands", () => {
	const getDb = useIntegrationTestDb();

	describe("submitCommand", () => {
		it("persists a pending click for the owner and hands the Runner its payload and Step id", async () => {
			const jobId = await seedInteractiveJob(getDb());

			const result = submitCommand(getDb(), String(jobId), click());

			expect(result.status).toBe(200);
			const commandId = (result.body as { data: { id: number } }).data.id;
			const pending = getPendingCommand(getDb(), "1", String(jobId), AUTH, SHARED_SECRET);
			expect(pending.body).toEqual({ data: { id: commandId, stepId: `intervention-${commandId}`, kind: "click", payload: { x: 10, y: 20 } } });
		});

		it("returns the original command for a duplicate commandKey without creating a second", async () => {
			const jobId = await seedInteractiveJob(getDb());

			const first = submitCommand(getDb(), String(jobId), click());
			const second = submitCommand(getDb(), String(jobId), click());

			expect(second.status).toBe(200);
			expect((second.body as { data: { id: number } }).data.id).toBe((first.body as { data: { id: number } }).data.id);
			expect(getDb().prepare("SELECT COUNT(*) AS n FROM intervention_command").get()).toEqual({ n: 1 });
		});

		it("rejects a reused commandKey carrying a different click with 409", async () => {
			const jobId = await seedInteractiveJob(getDb());
			submitCommand(getDb(), String(jobId), click());

			const result = submitCommand(getDb(), String(jobId), click({ x: 99 }));

			expect(result.status).toBe(409);
		});

		it("rejects a second command with 409 while one is pending", async () => {
			const jobId = await seedInteractiveJob(getDb());
			submitCommand(getDb(), String(jobId), click());

			const result = submitCommand(getDb(), String(jobId), click({ commandKey: "key-2" }));

			expect(result.status).toBe(409);
		});

		it("rejects a non-owner with 409 and creates no command", async () => {
			const jobId = await seedInteractiveJob(getDb());

			const result = submitCommand(getDb(), String(jobId), click({ operatorId: "op-2" }));

			expect(result.status).toBe(409);
			expect(getDb().prepare("SELECT COUNT(*) AS n FROM intervention_command").get()).toEqual({ n: 0 });
		});

		it.each([
			["a missing operatorId", { operatorId: undefined }],
			["a missing commandKey", { commandKey: "" }],
			["an unknown kind", { kind: "teleport" }],
			["a non-numeric x", { x: "10" }],
			["a negative y", { y: -1 }]
		])("rejects %s with 400 and creates no command", async (_label, overrides) => {
			const jobId = await seedInteractiveJob(getDb());

			const result = submitCommand(getDb(), String(jobId), click(overrides));

			expect(result.status).toBe(400);
			expect(getDb().prepare("SELECT COUNT(*) AS n FROM intervention_command").get()).toEqual({ n: 0 });
		});

		it("rejects an unknown Job with 404 and a body that is not an object with 400", async () => {
			await seedInteractiveJob(getDb());

			expect(submitCommand(getDb(), "999", click()).status).toBe(404);
			expect(submitCommand(getDb(), "1", undefined).status).toBe(400);
		});

		it("never returns the command in the Job detail", async () => {
			const jobId = await seedInteractiveJob(getDb());
			submitCommand(getDb(), String(jobId), click());

			expect(JSON.stringify(getJobDetail(getDb(), String(jobId)).body)).not.toContain("rawPayload");
		});
	});

	describe("voiding", () => {
		it.each([
			["cancelled", (db: Database.Database, jobId: number) => cancelJob(db, String(jobId))],
			["ended by the owner", (db: Database.Database, jobId: number) => endJob(db, String(jobId), { operatorId: "op-1" })]
		])("voids a pending command when the Job is %s and never serves it", async (_label, leave) => {
			const jobId = await seedInteractiveJob(getDb());
			submitCommand(getDb(), String(jobId), click());

			leave(getDb(), jobId);

			expect(getPendingCommand(getDb(), "1", String(jobId), AUTH, SHARED_SECRET).body).toEqual({ data: null });
			expect(getDb().prepare("SELECT status FROM intervention_command").get()).toEqual({ status: "Voided" });
		});
	});

	describe("getPendingCommand", () => {
		it("returns null when nothing is pending", async () => {
			const jobId = await seedInteractiveJob(getDb());

			expect(getPendingCommand(getDb(), "1", String(jobId), AUTH, SHARED_SECRET).body).toEqual({ data: null });
		});

		it.each([
			["a bad secret", "1", "Bearer nope", 401],
			["an unknown Runner", "99", AUTH, 404],
			["a Runner not assigned to the Job", "2", AUTH, 403]
		])("rejects %s", async (_label, runnerId, auth, status) => {
			const jobId = await seedInteractiveJob(getDb());

			expect(getPendingCommand(getDb(), runnerId, String(jobId), auth, SHARED_SECRET).status).toBe(status);
		});

		it("returns 404 for an unknown Job", async () => {
			await seedInteractiveJob(getDb());

			expect(getPendingCommand(getDb(), "1", "999", AUTH, SHARED_SECRET).status).toBe(404);
		});
	});

	describe("reportCommandResult", () => {
		it("accepts one result, writing the command's Transcript Step entry", async () => {
			const jobId = await seedInteractiveJob(getDb());
			const commandId = (submitCommand(getDb(), String(jobId), click()).body as { data: { id: number } }).data.id;

			const result = reportCommandResult(getDb(), "1", String(jobId), String(commandId), AUTH, SHARED_SECRET, RESULT_BODY);

			expect(result.status).toBe(200);
			expect(listTranscriptEntries(getDb(), jobId).at(-1)).toMatchObject({ text: { stepId: `intervention-${commandId}`, outcome: "succeeded" } });
			expect(getPendingCommand(getDb(), "1", String(jobId), AUTH, SHARED_SECRET).body).toEqual({ data: null });

			const again = reportCommandResult(getDb(), "1", String(jobId), String(commandId), AUTH, SHARED_SECRET, RESULT_BODY);
			expect(again.status).toBe(409);
		});

		it("discards the result of a command voided by a cancel: 409 and no Transcript entry", async () => {
			const jobId = await seedInteractiveJob(getDb());
			const commandId = (submitCommand(getDb(), String(jobId), click()).body as { data: { id: number } }).data.id;
			cancelJob(getDb(), String(jobId));
			const before = listTranscriptEntries(getDb(), jobId).length;

			const result = reportCommandResult(getDb(), "1", String(jobId), String(commandId), AUTH, SHARED_SECRET, RESULT_BODY);

			expect(result.status).toBe(409);
			expect(listTranscriptEntries(getDb(), jobId)).toHaveLength(before);
			expect(getDb().prepare("SELECT job_status_id AS status FROM job").get()).toEqual({ status: JobStatus.CompletedCancelled });
		});

		it.each([
			["a bad outcome", { ...RESULT_BODY, outcome: "maybe" }, 400],
			["a missing targetDescription", { outcome: "succeeded" }, 400],
			["no body", undefined, 400]
		])("rejects %s", async (_label, body, status) => {
			const jobId = await seedInteractiveJob(getDb());
			const commandId = (submitCommand(getDb(), String(jobId), click()).body as { data: { id: number } }).data.id;

			expect(reportCommandResult(getDb(), "1", String(jobId), String(commandId), AUTH, SHARED_SECRET, body).status).toBe(status);
		});

		it("rejects a non-numeric command id with 404 and a Runner not assigned to the Job with 403", async () => {
			const jobId = await seedInteractiveJob(getDb());

			expect(reportCommandResult(getDb(), "1", String(jobId), "abc", AUTH, SHARED_SECRET, RESULT_BODY).status).toBe(404);
			expect(reportCommandResult(getDb(), "2", String(jobId), "1", AUTH, SHARED_SECRET, RESULT_BODY).status).toBe(403);
		});
	});
});
