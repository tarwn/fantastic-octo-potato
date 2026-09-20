import type Database from "better-sqlite3";

import type { FieldDeclaration } from "../../types/recipeDefinition";
import { reportJobStep } from "../runner/runnerActions";
import { JobStatus } from "../storage/db/jobStatus";
import { JobType } from "../storage/db/jobType";
import { claimNextJobForRunner, insertJob } from "../storage/repositories/jobRepository";
import { createDraftRecipe, publishRecipe } from "../storage/repositories/recipeRepository";

import { takeControl } from "./interventionActions";

export const SHARED_SECRET = "test-secret";
export const AUTH = `Bearer ${SHARED_SECRET}`;
export const RESULT_BODY = { outcome: "succeeded", targetDescription: { component: "element", selector: "" } };

const now = new Date("2026-09-15T00:00:00.000Z");

const OUTPUTS: Record<string, FieldDeclaration> = {
	status: { type: "string", description: "Status", required: false, nullable: false, sensitive: false },
	total: { type: "number", description: "Total", required: false, nullable: false, sensitive: false },
	paid: { type: "boolean", description: "Paid", required: false, nullable: false, sensitive: false },
	stage: { type: "string", description: "Stage", required: false, nullable: false, sensitive: false, enum: ["open", "closed"] },
	secret: { type: "string", description: "Secret", required: false, nullable: false, sensitive: true }
};

export function seedRecipeJob(db: Database.Database): number {
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
		definition: { schemaVersion: 1, inputs: {}, outputs: { ...OUTPUTS }, steps: [{ id: "open_home", action: "open", args: ["https://example.com"] }], recoveries: [] },
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

export async function seedInteractiveJob(db: Database.Database): Promise<number> {
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

export const assign = (overrides: Record<string, unknown> = {}) => ({ operatorId: "op-1", commandKey: "key-1", kind: "assign", name: "status", value: "shipped", ...overrides });
export const click = (overrides: Record<string, unknown> = {}) => ({ operatorId: "op-1", commandKey: "key-1", kind: "click", x: 10, y: 20, ...overrides });
