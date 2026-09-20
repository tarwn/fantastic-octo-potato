import { describe, expect, it } from "vitest";

import { deriveAllowlistFromRecipe } from "./recipeAllowlist";

import type { RecipeDefinition } from "$lib/types/recipeDefinition";

function baseDefinition(openArgs: RecipeDefinition["steps"][0]["args"]): RecipeDefinition {
	return {
		schemaVersion: 1,
		inputs: {
			startingUrl: { type: "string", description: "Starting URL", required: true, nullable: false, sensitive: false }
		},
		outputs: {},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		steps: [{ id: "start", action: "open", args: openArgs } as any],
		recoveries: []
	};
}

describe("deriveAllowlistFromRecipe", () => {
	it("derives the origin from a literal starting URL (hand-authored Recipe)", () => {
		const definition = baseDefinition(["https://example.test/accounts"]);

		expect(deriveAllowlistFromRecipe(definition, {})).toBe("https://example.test");
	});

	it("derives the origin from the submitted startingUrl ingredient when the open Step references an input (compiled-from-Training Recipe)", () => {
		const definition = baseDefinition([{ ref: "input", name: "startingUrl" }]);

		expect(deriveAllowlistFromRecipe(definition, { startingUrl: "https://different-origin.test/app" })).toBe("https://different-origin.test");
	});

	it("returns undefined when the referenced input ingredient is missing", () => {
		const definition = baseDefinition([{ ref: "input", name: "startingUrl" }]);

		expect(deriveAllowlistFromRecipe(definition, {})).toBeUndefined();
	});

	it("returns undefined when the referenced input ingredient isn't a valid URL", () => {
		const definition = baseDefinition([{ ref: "input", name: "startingUrl" }]);

		expect(deriveAllowlistFromRecipe(definition, { startingUrl: "not-a-url" })).toBeUndefined();
	});

	it("returns undefined when there is no open Step", () => {
		const definition: RecipeDefinition = {
			schemaVersion: 1,
			inputs: {},
			outputs: {},
			steps: [{ id: "complete", action: "finish", args: [null] }],
			recoveries: []
		};

		expect(deriveAllowlistFromRecipe(definition, {})).toBeUndefined();
	});
});
