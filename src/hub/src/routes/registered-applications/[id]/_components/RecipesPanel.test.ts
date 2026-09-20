import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import RecipesPanel from "./RecipesPanel.svelte";

import type { RecipeSummary } from "$lib/api/recipesApi";

function sampleRecipe(overrides: Partial<RecipeSummary> = {}): RecipeSummary {
	return {
		id: 1,
		name: "Sample recipe",
		goal: "Sample goal",
		state: "Draft",
		sourceTrainingRunId: null,
		qualifiedByJobId: null,
		replacesRecipeId: null,
		definition: { schemaVersion: 1, inputs: {}, outputs: {}, steps: [], recoveries: [] },
		...overrides
	};
}

describe("RecipesPanel", () => {
	it("shows a message when there are no Recipes", () => {
		render(RecipesPanel, { recipes: [], registeredApplicationId: 1, onStartTrial: vi.fn(), onStartJob: vi.fn(), onPublish: vi.fn() });

		expect(screen.getByText("No Recipes yet.")).toBeInTheDocument();
	});

	it("lists the newest Draft Recipe first, with a Start Trial button", () => {
		const recipes = [sampleRecipe({ id: 1, name: "Older draft", state: "Draft" }), sampleRecipe({ id: 2, name: "Newer draft", state: "Draft" })];

		render(RecipesPanel, { recipes, registeredApplicationId: 1, onStartTrial: vi.fn(), onStartJob: vi.fn(), onPublish: vi.fn() });

		const names = screen.getAllByRole("link").map((link) => link.textContent?.trim());
		expect(names).toEqual(["Newer draft", "Older draft"]);
		expect(screen.getAllByRole("button", { name: "Start Trial" })).toHaveLength(2);
	});

	it("lists Released Recipes after Draft Recipes, with a Start Job button", () => {
		const recipes = [sampleRecipe({ id: 1, name: "Published recipe", state: "Published" }), sampleRecipe({ id: 2, name: "Draft recipe", state: "Draft" })];

		render(RecipesPanel, { recipes, registeredApplicationId: 1, onStartTrial: vi.fn(), onStartJob: vi.fn(), onPublish: vi.fn() });

		const names = screen.getAllByRole("link").map((link) => link.textContent?.trim());
		expect(names).toEqual(["Draft recipe", "Published recipe"]);
		expect(screen.getByRole("button", { name: "Start Job" })).toBeInTheDocument();
	});

	it("calls onStartTrial with the clicked Draft Recipe's id", async () => {
		const onStartTrial = vi.fn();
		render(RecipesPanel, { recipes: [sampleRecipe({ id: 9, state: "Draft" })], registeredApplicationId: 1, onStartTrial, onStartJob: vi.fn(), onPublish: vi.fn() });

		await fireEvent.click(screen.getByRole("button", { name: "Start Trial" }));

		expect(onStartTrial).toHaveBeenCalledWith(9);
	});

	it("calls onStartJob with the clicked Released Recipe's id", async () => {
		const onStartJob = vi.fn();
		render(RecipesPanel, { recipes: [sampleRecipe({ id: 9, state: "Published" })], registeredApplicationId: 1, onStartTrial: vi.fn(), onStartJob, onPublish: vi.fn() });

		await fireEvent.click(screen.getByRole("button", { name: "Start Job" }));

		expect(onStartJob).toHaveBeenCalledWith(9);
	});

	it("links each Recipe's name to its review view", () => {
		render(RecipesPanel, {
			recipes: [sampleRecipe({ id: 9, name: "Read invoice", state: "Draft" })],
			registeredApplicationId: 3,
			onStartTrial: vi.fn(),
			onStartJob: vi.fn(),
			onPublish: vi.fn()
		});

		expect(screen.getByRole("link", { name: "Read invoice" })).toHaveAttribute("href", "/registered-applications/3/recipes/9");
	});

	it("omits Archived Recipes", () => {
		const recipes = [sampleRecipe({ id: 1, name: "Old", state: "Archived" }), sampleRecipe({ id: 2, name: "Live", state: "Published" })];

		render(RecipesPanel, { recipes, registeredApplicationId: 1, onStartTrial: vi.fn(), onStartJob: vi.fn(), onPublish: vi.fn() });

		expect(screen.queryByText("Old")).not.toBeInTheDocument();
		expect(screen.getByText("Live")).toBeInTheDocument();
	});

	it("shows each Recipe's state", () => {
		const recipes = [
			sampleRecipe({ id: 1, name: "Untested", state: "Draft" }),
			sampleRecipe({ id: 2, name: "Passed", state: "Draft", qualifiedByJobId: 7 }),
			sampleRecipe({ id: 3, name: "Live", state: "Published" })
		];

		render(RecipesPanel, { recipes, registeredApplicationId: 1, onStartTrial: vi.fn(), onStartJob: vi.fn(), onPublish: vi.fn() });

		expect(screen.getByText("Not yet qualified")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Trial passed" })).toHaveAttribute("href", "/jobs/7");
		expect(screen.getByText("Published")).toBeInTheDocument();
	});

	it("enables Publish only for a qualified Draft and calls onPublish with its id", async () => {
		const onPublish = vi.fn();
		const recipes = [sampleRecipe({ id: 1, state: "Draft" }), sampleRecipe({ id: 2, state: "Draft", qualifiedByJobId: 7 }), sampleRecipe({ id: 3, state: "Published" })];
		render(RecipesPanel, { recipes, registeredApplicationId: 1, onStartTrial: vi.fn(), onStartJob: vi.fn(), onPublish });

		const publishButtons = screen.getAllByRole("button", { name: "Publish" });
		expect(publishButtons).toHaveLength(2);
		expect(publishButtons[0]).toBeEnabled();
		expect(publishButtons[1]).toBeDisabled();

		await fireEvent.click(publishButtons[0]);

		expect(onPublish).toHaveBeenCalledWith(2);
	});
});
