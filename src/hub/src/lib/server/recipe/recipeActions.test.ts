import { describe, expect, it } from "vitest";

import { RecipeStatus } from "../storage/db/recipeStatus";
import type { Recipe } from "../storage/repositories/recipeRepository";

import { toRecipeSummaries } from "./recipeActions";

import type { RecipeDefinition } from "$lib/types/recipeDefinition";

function sampleDefinition(): RecipeDefinition {
	return {
		schemaVersion: 1,
		inputs: {},
		outputs: {},
		steps: [{ id: "start", action: "open", args: ["https://example.test"] }],
		recoveries: []
	};
}

function sampleRecipe(overrides: Partial<Recipe> = {}): Recipe {
	return {
		id: 1,
		customerApplicationXrefId: 1,
		recipeStatusId: RecipeStatus.Draft,
		version: 1,
		name: "Sample recipe",
		goal: "Sample goal",
		definition: sampleDefinition(),
		sourceTrainingRunId: null,
		createdAt: new Date("2026-09-17T00:00:00.000Z"),
		publishedAt: null,
		replacesRecipeId: null,
		...overrides
	};
}

describe("toRecipeSummaries", () => {
	it("maps a Draft Recipe's status to the 'Draft' label", () => {
		const summaries = toRecipeSummaries([sampleRecipe({ recipeStatusId: RecipeStatus.Draft })], new Map());

		expect(summaries).toEqual([
			expect.objectContaining({ id: 1, name: "Sample recipe", goal: "Sample goal", state: "Draft" })
		]);
	});

	it("maps a Released Recipe's status to the 'Published' label", () => {
		const summaries = toRecipeSummaries([sampleRecipe({ recipeStatusId: RecipeStatus.Released })], new Map());

		expect(summaries).toEqual([expect.objectContaining({ state: "Published" })]);
	});

	it("carries the Recipe's definition through unchanged", () => {
		const definition = sampleDefinition();

		const summaries = toRecipeSummaries([sampleRecipe({ definition })], new Map());

		expect(summaries[0].definition).toBe(definition);
	});

	it("carries the Recipe's sourceTrainingRunId through unchanged", () => {
		const summaries = toRecipeSummaries([sampleRecipe({ sourceTrainingRunId: "7" })], new Map());

		expect(summaries[0].sourceTrainingRunId).toBe("7");
	});

	it("maps an Archived Recipe's status to the 'Archived' label", () => {
		const summaries = toRecipeSummaries([sampleRecipe({ recipeStatusId: RecipeStatus.Archived })], new Map());

		expect(summaries[0].state).toBe("Archived");
	});

	it("carries the qualifying Trial Job id and replaced Recipe id, or null when absent", () => {
		const summaries = toRecipeSummaries([sampleRecipe({ id: 1, replacesRecipeId: 9 }), sampleRecipe({ id: 2 })], new Map([[1, 42]]));

		expect(summaries.map(({ qualifiedByJobId, replacesRecipeId }) => ({ qualifiedByJobId, replacesRecipeId }))).toEqual([
			{ qualifiedByJobId: 42, replacesRecipeId: 9 },
			{ qualifiedByJobId: null, replacesRecipeId: null }
		]);
	});

	it("never exposes raw* keys", () => {
		const [summary] = toRecipeSummaries([sampleRecipe()], new Map());

		expect(Object.keys(summary).filter((key) => key.startsWith("raw"))).toEqual([]);
	});
});
