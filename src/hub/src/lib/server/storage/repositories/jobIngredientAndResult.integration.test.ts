import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { useIntegrationTestDb } from "../db/_test/integrationTestDb";
import { JobStatus } from "../db/jobStatus";
import { TranscriptKind } from "../db/jobTranscriptKind";
import { JobType } from "../db/jobType";
import { SensitivityType } from "../db/sensitivityType";

import {
	appendTranscriptEntry,
	getSafeJobIngredientByFieldName,
	insertJob,
	listSafeJobIngredients,
	listSafeJobResults,
	listSensitiveJobIngredients,
	listSensitiveJobResults,
	listTranscriptEntries,
	upsertJobIngredient,
	upsertJobResult
} from "./jobRepository";

function seedXref(db: Database.Database, id = 1): void {
	db.exec(`
		INSERT INTO customer (id, name) VALUES (${id}, 'Acme');
		INSERT INTO application (id, name) VALUES (${id}, 'Widgets');
		INSERT INTO customer_application_xref (id, customer_id, application_id) VALUES (${id}, ${id}, ${id});
	`);
}

function insertPendingTrainingRunJob(db: Database.Database, xrefId: number): number {
	const job = insertJob(db, {
		jobType: JobType.TrainingRun,
		customerApplicationXrefId: xrefId,
		goal: "Extract invoice total",
		startingUrl: "https://example.com/start",
		allowlist: "https://example.com",
		maxSteps: 10,
		alternateGoals: [],
		syntheticDataConfirmed: false,
		stepTimeoutMs: 15000,
		createdAt: new Date("2026-09-15T00:00:00.000Z")
	});
	return job.id;
}

describe("jobRepository transcript entries", () => {
	const getDb = useIntegrationTestDb();

	it("ignores a duplicate transcript sequence instead of inserting a second row", () => {
		const db = getDb();
		seedXref(db);
		const jobId = insertPendingTrainingRunJob(db, 1);
		const firstCreatedAt = new Date("2026-09-15T00:01:00.000Z");

		appendTranscriptEntry(db, jobId, 1, TranscriptKind.Info, "First report", firstCreatedAt);
		appendTranscriptEntry(db, jobId, 1, TranscriptKind.Info, "Late duplicate report", new Date("2026-09-15T00:02:00.000Z"));

		expect(listTranscriptEntries(db, jobId)).toEqual([
			{
				id: expect.any(Number),
				jobId,
				sequence: 1,
				kind: TranscriptKind.Info,
				text: "First report",
				createdAt: firstCreatedAt,
				jobStatusId: null
			}
		]);
	});

	it("records the Job's new status on a Status-kind transcript entry", () => {
		const db = getDb();
		seedXref(db);
		const jobId = insertPendingTrainingRunJob(db, 1);

		appendTranscriptEntry(db, jobId, -1, TranscriptKind.Status, "Picked up by Runner 1", new Date("2026-09-15T00:01:00.000Z"), JobStatus.Running);

		expect(listTranscriptEntries(db, jobId)).toEqual([
			{
				id: expect.any(Number),
				jobId,
				sequence: -1,
				kind: TranscriptKind.Status,
				text: "Picked up by Runner 1",
				createdAt: new Date("2026-09-15T00:01:00.000Z"),
				jobStatusId: JobStatus.Running
			}
		]);
	});

	it("round-trips a Step-kind entry's structured text as a parsed object, not a JSON string", () => {
		const db = getDb();
		seedXref(db);
		const jobId = insertPendingTrainingRunJob(db, 1);
		const createdAt = new Date("2026-09-15T00:01:00.000Z");
		const stepText = {
			message: "Extracted the target field",
			inputs: [{ fieldName: "starting_url", safeValue: "https://example.com/start", sensitivityType: SensitivityType.None }],
			outputs: [{ fieldName: "total", safeValue: "••••••", sensitivityType: SensitivityType.PII }]
		};

		appendTranscriptEntry(db, jobId, 1, TranscriptKind.Step, stepText, createdAt);

		const entries = listTranscriptEntries(db, jobId);
		expect(entries).toEqual([
			{
				id: expect.any(Number),
				jobId,
				sequence: 1,
				kind: TranscriptKind.Step,
				text: stepText,
				createdAt,
				jobStatusId: null
			}
		]);
		expect(typeof entries[0].text).toBe("object");
	});

	it("returns a plain string for every non-Step kind", () => {
		const db = getDb();
		seedXref(db);
		const jobId = insertPendingTrainingRunJob(db, 1);

		appendTranscriptEntry(db, jobId, 1, TranscriptKind.Observe, "Looked at the page", new Date("2026-09-15T00:01:00.000Z"));

		expect(typeof listTranscriptEntries(db, jobId)[0].text).toBe("string");
	});
});

describe("jobRepository job ingredients", () => {
	const getDb = useIntegrationTestDb();

	it("masks the safe value with a fixed token when sensitivityType is not None, leaving the raw value untouched", () => {
		const db = getDb();
		seedXref(db);
		const jobId = insertPendingTrainingRunJob(db, 1);

		upsertJobIngredient(db, jobId, "ssn", "123-45-6789", SensitivityType.PII, new Date("2026-09-15T00:01:00.000Z"));

		expect(listSafeJobIngredients(db, jobId)).toEqual([
			{ fieldName: "ssn", safeValue: "••••••", sensitivityType: SensitivityType.PII }
		]);
		expect(listSensitiveJobIngredients(db, jobId)).toEqual([
			{
				fieldName: "ssn",
				safeValue: "••••••",
				sensitivityType: SensitivityType.PII,
				rawValue: "123-45-6789"
			}
		]);
	});

	it("leaves safeValue equal to rawValue when sensitivityType is None", () => {
		const db = getDb();
		seedXref(db);
		const jobId = insertPendingTrainingRunJob(db, 1);

		upsertJobIngredient(db, jobId, "starting_url", "https://example.com/start", SensitivityType.None, new Date("2026-09-15T00:01:00.000Z"));

		expect(listSafeJobIngredients(db, jobId)).toEqual([
			{ fieldName: "starting_url", safeValue: "https://example.com/start", sensitivityType: SensitivityType.None }
		]);
	});

	it("upserts so the latest write wins", () => {
		const db = getDb();
		seedXref(db);
		const jobId = insertPendingTrainingRunJob(db, 1);

		upsertJobIngredient(db, jobId, "field", "first", SensitivityType.None, new Date("2026-09-15T00:01:00.000Z"));
		upsertJobIngredient(db, jobId, "field", "second", SensitivityType.None, new Date("2026-09-15T00:02:00.000Z"));

		expect(listSafeJobIngredients(db, jobId)).toEqual([{ fieldName: "field", safeValue: "second", sensitivityType: SensitivityType.None }]);
	});

	it("finds a single ingredient by field name", () => {
		const db = getDb();
		seedXref(db);
		const jobId = insertPendingTrainingRunJob(db, 1);
		upsertJobIngredient(db, jobId, "field", "value", SensitivityType.None, new Date("2026-09-15T00:01:00.000Z"));

		expect(getSafeJobIngredientByFieldName(db, jobId, "field")).toEqual({
			fieldName: "field",
			safeValue: "value",
			sensitivityType: SensitivityType.None
		});
		expect(getSafeJobIngredientByFieldName(db, jobId, "missing")).toBeUndefined();
	});

	it("a safe read's return type has no raw-value field reachable at compile time", () => {
		const result = listSafeJobIngredients(getDb(), 1)[0];
		// @ts-expect-error - SafeIngredient never carries a raw value; only the sensitive read does.
		expect(result?.rawValue).toBeUndefined();
	});
});

describe("jobRepository job results", () => {
	const getDb = useIntegrationTestDb();

	it("upserts a job result so the latest write wins, masking per sensitivityType", () => {
		const db = getDb();
		seedXref(db);
		const jobId = insertPendingTrainingRunJob(db, 1);

		upsertJobResult(db, jobId, "total", "10.00", SensitivityType.None, new Date("2026-09-15T00:01:00.000Z"));
		upsertJobResult(db, jobId, "total", "12.50", SensitivityType.PII, new Date("2026-09-15T00:02:00.000Z"));

		expect(listSafeJobResults(db, jobId)).toEqual([
			{ fieldName: "total", safeValue: "••••••", sensitivityType: SensitivityType.PII }
		]);
		expect(listSensitiveJobResults(db, jobId)).toEqual([
			{
				fieldName: "total",
				safeValue: "••••••",
				sensitivityType: SensitivityType.PII,
				rawValue: "12.50"
			}
		]);
	});

	it("a safe read's return type has no raw-value field reachable at compile time", () => {
		const result = listSafeJobResults(getDb(), 1)[0];
		// @ts-expect-error - SafeResult never carries a raw value; only the sensitive read does.
		expect(result?.rawValue).toBeUndefined();
	});
});
