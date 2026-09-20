import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { getPendingCommand, reportCommandResult } from "../runner/interventionCommandActions";
import { useIntegrationTestDb } from "../storage/db/_test/integrationTestDb";
import { JobStatus } from "../storage/db/jobStatus";
import { listTranscriptEntries } from "../storage/repositories/jobRepository";

import { endJob, submitCommand } from "./interventionActions";
import { assign, AUTH, click, RESULT_BODY, seedInteractiveJob, SHARED_SECRET } from "./interventionTestSeed";
import { cancelJob, getJobDetail } from "./jobActions";

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

	describe("submitCommand assign", () => {
		it("persists the typed value for the Runner and returns only the safe form", async () => {
			const jobId = await seedInteractiveJob(getDb());

			const result = submitCommand(getDb(), String(jobId), assign({ name: "total", value: "12.5" }));

			expect(result.status).toBe(200);
			const { id, safePayload } = (result.body as { data: { id: number; safePayload: unknown } }).data;
			expect(safePayload).toEqual({ name: "total", value: "12.5" });
			expect(getPendingCommand(getDb(), "1", String(jobId), AUTH, SHARED_SECRET).body).toEqual({
				data: { id, stepId: `intervention-${id}`, kind: "assign", payload: { name: "total", value: 12.5 } }
			});
		});

		it("converts a boolean value and masks a sensitive value in the response and stored safe payload", async () => {
			const jobId = await seedInteractiveJob(getDb());
			const paid = submitCommand(getDb(), String(jobId), assign({ commandKey: "a", name: "paid", value: "true" }));
			expect(getPendingCommand(getDb(), "1", String(jobId), AUTH, SHARED_SECRET).body).toMatchObject({ data: { payload: { name: "paid", value: true } } });
			getDb().prepare("UPDATE intervention_command SET status = 'Completed'").run();

			const result = submitCommand(getDb(), String(jobId), assign({ commandKey: "b", name: "secret", value: "hunter2" }));

			expect(paid.status).toBe(200);
			expect(JSON.stringify(result.body)).not.toContain("hunter2");
			expect(getDb().prepare("SELECT safe_payload AS safePayload FROM intervention_command WHERE command_key = 'b'").get()).toEqual({
				safePayload: expect.not.stringContaining("hunter2")
			});
		});

		it.each([
			["an undeclared output", { name: "nope" }],
			["a prototype property name", { name: "constructor" }],
			["a non-numeric number", { name: "total", value: "abc" }],
			["an empty number", { name: "total", value: " " }],
			["a non-boolean boolean", { name: "paid", value: "yes" }],
			["a value outside the enum", { name: "stage", value: "pending" }],
			["a missing value", { value: undefined }]
		])("rejects %s with 400 and creates no command", async (_label, overrides) => {
			const jobId = await seedInteractiveJob(getDb());

			const result = submitCommand(getDb(), String(jobId), assign(overrides));

			expect(result.status).toBe(400);
			expect(getDb().prepare("SELECT COUNT(*) AS n FROM intervention_command").get()).toEqual({ n: 0 });
		});

		it("writes the assigned value to Results on success, masking a sensitive one in the Transcript", async () => {
			const jobId = await seedInteractiveJob(getDb());
			const commandId = (submitCommand(getDb(), String(jobId), assign({ name: "secret", value: "hunter2" })).body as { data: { id: number } }).data.id;

			reportCommandResult(getDb(), "1", String(jobId), String(commandId), AUTH, SHARED_SECRET, RESULT_BODY);

			expect(getDb().prepare("SELECT field_name AS fieldName, raw_value AS rawValue FROM job_result").get()).toEqual({ fieldName: "secret", rawValue: "hunter2" });
			expect(JSON.stringify(listTranscriptEntries(getDb(), jobId))).not.toContain("hunter2");
		});

		it("writes no Result when the command failed", async () => {
			const jobId = await seedInteractiveJob(getDb());
			const commandId = (submitCommand(getDb(), String(jobId), assign()).body as { data: { id: number } }).data.id;

			reportCommandResult(getDb(), "1", String(jobId), String(commandId), AUTH, SHARED_SECRET, { ...RESULT_BODY, outcome: "failed" });

			expect(getDb().prepare("SELECT COUNT(*) AS n FROM job_result").get()).toEqual({ n: 0 });
		});
	});

	describe("getJobDetail", () => {
		it("resolves each completed command Step to its action instead of crashing", async () => {
			const jobId = await seedInteractiveJob(getDb());
			const finish = (body: unknown) => {
				const { id } = (submitCommand(getDb(), String(jobId), body).body as { data: { id: number } }).data;
				reportCommandResult(getDb(), "1", String(jobId), String(id), AUTH, SHARED_SECRET, RESULT_BODY);
				return id;
			};
			const clickId = finish(click());
			const assignId = finish(assign({ commandKey: "key-2" }));

			const actions = (getJobDetail(getDb(), String(jobId)).body as { data: { transcript: { text: { stepId?: string; action?: string } }[] } }).data.transcript
				.filter((entry) => entry.text.stepId?.startsWith("intervention-"))
				.map((entry) => [entry.text.stepId, entry.text.action]);
			expect(actions).toEqual([[`intervention-${clickId}`, "click"], [`intervention-${assignId}`, "assign"]]);
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
