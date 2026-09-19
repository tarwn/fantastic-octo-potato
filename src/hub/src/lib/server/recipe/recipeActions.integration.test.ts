import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { useIntegrationTestDb } from "../storage/db/_test/integrationTestDb";
import { createDraftRecipe, publishRecipe } from "../storage/repositories/recipeRepository";

import { listRecipesAction } from "./recipeActions";

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

describe("recipeActions", () => {
	const getDb = useIntegrationTestDb();

	describe("listRecipesAction", () => {
		it("rejects an unknown Registered Application", () => {
			const result = listRecipesAction(getDb(), "999");

			expect(result).toEqual({ status: 404, body: { error: "Registered Application 999 not found" } });
		});

		it("lists draft and published Recipes for the Registered Application", () => {
			const db = getDb();
			const xrefId = seedRegisteredApplication(db);
			const draft = createDraftRecipe(db, {
				customerApplicationXrefId: xrefId,
				name: "Draft recipe",
				goal: "Goal one",
				definition: sampleDefinition(),
				sourceTrainingRunId: null,
				createdAt: new Date("2026-09-17T00:00:00.000Z")
			});
			const published = createDraftRecipe(db, {
				customerApplicationXrefId: xrefId,
				name: "Published recipe",
				goal: "Goal two",
				definition: sampleDefinition(),
				sourceTrainingRunId: null,
				createdAt: new Date("2026-09-17T00:00:00.000Z")
			});
			publishRecipe(db, published.id, new Date("2026-09-17T00:00:01.000Z"));

			const result = listRecipesAction(db, String(xrefId));

			expect(result.status).toBe(200);
			expect(result.body).toEqual({
				data: [
					{ id: draft.id, name: "Draft recipe", goal: "Goal one", state: "Draft", definition: sampleDefinition() },
					{ id: published.id, name: "Published recipe", goal: "Goal two", state: "Published", definition: sampleDefinition() }
				]
			});
		});
	});
});
