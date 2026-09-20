import { describe, expect, it } from "vitest";

import { collectResumableStepIds } from "./recipeStepIds";

import type { RecipeDefinition } from "$lib/types/recipeDefinition";

describe("collectResumableStepIds", () => {
	it("lists top-level Steps and the children of group and if Steps, but not recovery Steps", () => {
		const recipe: RecipeDefinition = {
			schemaVersion: 1,
			inputs: {},
			outputs: {},
			steps: [
				{ id: "open_home", action: "open", args: ["https://example.com"] },
				{ id: "grp", action: "group", args: [[{ id: "grp_click", action: "click", args: [{ by: "text", value: "Go" }] }]] },
				{
					id: "branch",
					action: "if",
					args: [
						[{ when: { test: "exists", args: [{ by: "text", value: "A" }] }, steps: [{ id: "case_click", action: "click", args: [{ by: "text", value: "A" }] }] }],
						[{ id: "else_click", action: "click", args: [{ by: "text", value: "B" }] }]
					]
				}
			],
			recoveries: [{ id: "rec", description: "d", when: { test: "exists", args: [{ by: "text", value: "X" }] }, steps: [{ id: "rec_click", action: "click", args: [{ by: "text", value: "X" }] }] }]
		};

		expect(collectResumableStepIds(recipe)).toEqual(["open_home", "grp", "grp_click", "branch", "case_click", "else_click"]);
	});
});
