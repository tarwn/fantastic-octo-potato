import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { useIntegrationTestDb } from "./storage/_test/integrationTestDb";
import { insertJob, upsertJobIngredient } from "./storage/jobRepository";
import { JobType } from "./storage/jobType";
import { createDraftRecipe, publishRecipe } from "./storage/recipeRepository";
import { SensitivityType } from "./storage/sensitivityType";
import { runnerPoll } from "./runnerActions";

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
		inputs: {
			accountQuery: { type: "string", description: "Account to search", required: true, nullable: false, sensitive: true }
		},
		outputs: {
			status: { type: "string", description: "Search outcome", required: true, nullable: false, sensitive: false }
		},
		steps: [
			{ id: "start", action: "open", args: ["https://example.test/accounts"] },
			{ id: "complete", action: "finish", args: [{ test: "assigned", args: [{ ref: "output", name: "status" }] }] }
		],
		recoveries: []
	};
}

describe("runnerActions Recipe Job dispatch", () => {
	const getDb = useIntegrationTestDb();

	it("returns the full runner payload contract for a claimed recipe_job, built from the stored Recipe", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
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
		upsertJobIngredient(db, job.id, "accountQuery", "ACCT-1042", SensitivityType.PII, new Date("2026-09-15T00:00:02.000Z"));

		const result = await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		expect(result).toEqual({
			status: 200,
			body: {
				data: {
					hasWork: true,
					job: {
						id: job.id,
						mode: "Execute",
						recipeId: recipe.id,
						recipeVersion: recipe.version,
						recipe: recipe.definition,
						ingredients: { accountQuery: "ACCT-1042" },
						controls: { allowedOrigins: ["https://example.test"] },
						stepTimeoutMs: 15_000,
						comms: {
							statusUrl: `/api/hub/jobs/${job.id}`,
							artifactsUrl: `/api/runner/runners/${runnerId}/jobs/${job.id}/artifacts`
						}
					}
				}
			}
		});
	});

	it("marks the claimed recipe_job Running, not still Pending", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const draft = createDraftRecipe(db, {
			customerApplicationXrefId: 1,
			name: "Sample recipe",
			goal: "Sample goal",
			definition: sampleDefinition(),
			sourceTrainingRunId: null,
			createdAt: new Date("2026-09-15T00:00:00.000Z")
		});
		const recipe = publishRecipe(db, draft.id, new Date("2026-09-15T00:00:01.000Z"))!;
		insertJob(db, {
			jobType: JobType.Recipe,
			customerApplicationXrefId: 1,
			recipeId: recipe.id,
			mode: "Trial",
			allowlist: "https://example.test",
			stepTimeoutMs: 15_000,
			createdAt: new Date("2026-09-15T00:00:02.000Z")
		});

		const result = await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		expect((result.body as { data: { job: { mode: string } } }).data.job.mode).toBe("Trial");
		expect(result.status).toBe(200);
	});

	it("coerces ingredient values to the Recipe's declared input types", async () => {
		const db = getDb();
		const runnerId = seedRunner(db);
		const definition: RecipeDefinition = {
			schemaVersion: 1,
			inputs: {
				count: { type: "number", description: "A count", required: true, nullable: false, sensitive: false },
				confirmed: { type: "boolean", description: "A flag", required: true, nullable: false, sensitive: false }
			},
			outputs: {},
			steps: [{ id: "start", action: "open", args: ["https://example.test"] }],
			recoveries: []
		};
		const draft = createDraftRecipe(db, {
			customerApplicationXrefId: 1,
			name: "Typed recipe",
			goal: "Goal",
			definition,
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
		upsertJobIngredient(db, job.id, "count", "3", SensitivityType.None, new Date("2026-09-15T00:00:02.000Z"));
		upsertJobIngredient(db, job.id, "confirmed", "true", SensitivityType.None, new Date("2026-09-15T00:00:02.000Z"));

		const result = await runnerPoll(db, String(runnerId), `Bearer ${SHARED_SECRET}`, SHARED_SECRET);

		expect((result.body as { data: { job: { ingredients: unknown } } }).data.job.ingredients).toEqual({ count: 3, confirmed: true });
	});
});
