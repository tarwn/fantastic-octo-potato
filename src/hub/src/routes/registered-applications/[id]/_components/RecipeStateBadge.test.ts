import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import RecipeStateBadge from "./RecipeStateBadge.svelte";

describe("RecipeStateBadge", () => {
	it("shows a draft with no successful Trial as not yet qualified", () => {
		render(RecipeStateBadge, { state: "Draft", qualifiedByJobId: null });

		expect(screen.getByText("Not yet qualified")).toBeInTheDocument();
	});

	it("shows a qualified draft as Trial passed, linking the Trial Job", () => {
		render(RecipeStateBadge, { state: "Draft", qualifiedByJobId: 12 });

		expect(screen.getByRole("link", { name: "Trial passed" })).toHaveAttribute("href", "/jobs/12");
	});

	it("shows Published and Archived Recipes by state", () => {
		const { unmount } = render(RecipeStateBadge, { state: "Published", qualifiedByJobId: 12 });
		expect(screen.getByText("Published")).toBeInTheDocument();
		unmount();

		render(RecipeStateBadge, { state: "Archived", qualifiedByJobId: 12 });
		expect(screen.getByText("Archived")).toBeInTheDocument();
	});
});
