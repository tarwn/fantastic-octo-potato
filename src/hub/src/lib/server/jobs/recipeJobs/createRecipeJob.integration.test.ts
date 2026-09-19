import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { useIntegrationTestDb } from "../../storage/db/_test/integrationTestDb";
import { JobType } from "../../storage/db/jobType";
import { listSafeJobIngredients, listTranscriptEntries } from "../../storage/repositories/jobRepository";
import { createDraftRecipe, publishRecipe } from "../../storage/repositories/recipeRepository";

import { createRecipeJob } from "./createRecipeJob";

import type { RecipeDefinition } from "$lib/types/recipeDefinition";

function seedRegisteredApplication(db: Database.Database, id = 1): number {
	db.exec(`
		INSERT INTO customer (id, name) VALUES (${id}, 'Acme');
		INSERT INTO application (id, name) VALUES (${id}, 'BambooInvoice');
		INSERT INTO customer_application_xref (id, customer_id, application_id) VALUES (${id}, ${id}, ${id});
	`);
	return id;
}

function sampleDefinition(): RecipeDefinition {
	return {
		schemaVersion: 1,
		inputs: {
			accountQuery: { type: "string", description: "Account to search", required: true, nullable: false, sensitive: true },
			retries: { type: "number", description: "Retry count", required: false, nullable: false, sensitive: false }
		},
		outputs: {
			status: { type: "string", description: "Search outcome", required: true, nullable: false, sensitive: false }
		},
		steps: [
			{ id: "start", action: "open", args: ["https://example.test/accounts"], irreversible: false },
			{ id: "complete", action: "finish", args: [{ test: "assigned", args: [{ ref: "output", name: "status" }] }] }
		],
		recoveries: []
	};
}

describe("createRecipeJob", () => {
	const getDb = useIntegrationTestDb();

	function seedPublishedRecipe(db: Database.Database, xrefId: number) {
		const draft = createDraftRecipe(db, {
			customerApplicationXrefId: xrefId,
			name: "Sample recipe",
			goal: "Sample goal",
			definition: sampleDefinition(),
			sourceTrainingRunId: null,
			createdAt: new Date("2026-09-17T00:00:00.000Z")
		});
		return publishRecipe(db, draft.id, new Date("2026-09-17T00:00:01.000Z"))!;
	}

	it("rejects an unknown Recipe", () => {
		const result = createRecipeJob(getDb(), "999", { mode: "Execute", ingredients: {} });

		expect(result).toEqual({ status: 404, body: { error: "Recipe 999 not found" } });
	});

	it("rejects an invalid mode", () => {
		const db = getDb();
		const xrefId = seedRegisteredApplication(db);
		const recipe = seedPublishedRecipe(db, xrefId);

		const result = createRecipeJob(db, String(recipe.id), { mode: "Bogus", ingredients: {} });

		expect(result).toEqual({ status: 400, body: { error: "mode must be 'Trial' or 'Execute'" } });
	});

	it("rejects Trial mode against a published Recipe", () => {
		const db = getDb();
		const xrefId = seedRegisteredApplication(db);
		const recipe = seedPublishedRecipe(db, xrefId);

		const result = createRecipeJob(db, String(recipe.id), {
			mode: "Trial",
			ingredients: { accountQuery: "ACCT-1" }
		});

		expect(result).toEqual({ status: 400, body: { error: "Start Trial requires a draft Recipe" } });
	});

	it("rejects a missing required ingredient", () => {
		const db = getDb();
		const xrefId = seedRegisteredApplication(db);
		const recipe = seedPublishedRecipe(db, xrefId);

		const result = createRecipeJob(db, String(recipe.id), { mode: "Execute", ingredients: {} });

		expect(result).toEqual({ status: 400, body: { error: "accountQuery is required" } });
	});

	it("rejects an ingredient with the wrong declared type", () => {
		const db = getDb();
		const xrefId = seedRegisteredApplication(db);
		const recipe = seedPublishedRecipe(db, xrefId);

		const result = createRecipeJob(db, String(recipe.id), {
			mode: "Execute",
			ingredients: { accountQuery: "ACCT-1", retries: "not-a-number" }
		});

		expect(result).toEqual({ status: 400, body: { error: "retries must be a number" } });
	});

	it("rejects an ingredient the Recipe doesn't declare", () => {
		const db = getDb();
		const xrefId = seedRegisteredApplication(db);
		const recipe = seedPublishedRecipe(db, xrefId);

		const result = createRecipeJob(db, String(recipe.id), {
			mode: "Execute",
			ingredients: { accountQuery: "ACCT-1", bogus: "x" }
		});

		expect(result).toEqual({ status: 400, body: { error: "Unknown ingredient: bogus" } });
	});

	it("creates a Pending Recipe Job with the allowlist derived from the Recipe's starting URL and stores ingredients", () => {
		const db = getDb();
		const xrefId = seedRegisteredApplication(db);
		const recipe = seedPublishedRecipe(db, xrefId);

		const result = createRecipeJob(db, String(recipe.id), {
			mode: "Execute",
			ingredients: { accountQuery: "ACCT-1042", retries: 2 }
		});

		expect(result.status).toBe(201);
		const job = (result.body as { data: { id: number } }).data;
		expect(result.body).toEqual({
			data: expect.objectContaining({
				jobType: JobType.Recipe,
				customerApplicationXrefId: xrefId,
				details: expect.objectContaining({ recipeId: recipe.id, mode: "Execute", allowlist: "https://example.test" })
			})
		});

		expect(listSafeJobIngredients(db, job.id)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ fieldName: "accountQuery" }),
				expect.objectContaining({ fieldName: "retries", safeValue: "2" })
			])
		);
		expect(listTranscriptEntries(db, job.id)).toHaveLength(1);
	});
});
