import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import CompiledRecipeLink from "./CompiledRecipeLink.svelte";

describe("CompiledRecipeLink", () => {
	it("renders nothing when no compiled Recipe exists", () => {
		render(CompiledRecipeLink, { recipe: null, registeredApplicationId: 1 });

		expect(screen.queryByRole("link")).not.toBeInTheDocument();
	});

	it("links to the compiled draft Recipe's review view", () => {
		render(CompiledRecipeLink, { recipe: { id: 9, name: "Read invoice" }, registeredApplicationId: 3 });

		const link = screen.getByRole("link", { name: /Read invoice/ });
		expect(link).toHaveAttribute("href", "/registered-applications/3/recipes/9");
	});
});
