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
		...overrides
	};
}

describe("toRecipeSummaries", () => {
	it("maps a Draft Recipe's status to the 'Draft' label", () => {
		const summaries = toRecipeSummaries([sampleRecipe({ recipeStatusId: RecipeStatus.Draft })]);

		expect(summaries).toEqual([
			expect.objectContaining({ id: 1, name: "Sample recipe", goal: "Sample goal", state: "Draft" })
		]);
	});

	it("maps a Released Recipe's status to the 'Published' label", () => {
		const summaries = toRecipeSummaries([sampleRecipe({ recipeStatusId: RecipeStatus.Released })]);

		expect(summaries).toEqual([expect.objectContaining({ state: "Published" })]);
	});

	it("carries the Recipe's definition through unchanged", () => {
		const definition = sampleDefinition();

		const summaries = toRecipeSummaries([sampleRecipe({ definition })]);

		expect(summaries[0].definition).toBe(definition);
	});

	it("carries the Recipe's sourceTrainingRunId through unchanged", () => {
		const summaries = toRecipeSummaries([sampleRecipe({ sourceTrainingRunId: "7" })]);

		expect(summaries[0].sourceTrainingRunId).toBe("7");
	});
});
