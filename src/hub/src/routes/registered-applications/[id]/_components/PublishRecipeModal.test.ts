import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import PublishRecipeModal from "./PublishRecipeModal.svelte";

import { publishRecipe, type RecipeSummary } from "$lib/api/recipesApi";

vi.mock("$lib/api/recipesApi", () => ({ publishRecipe: vi.fn() }));

// jsdom doesn't implement <dialog> showModal()/close(), so polyfill them for this component's tests.
beforeAll(() => {
	if (!HTMLDialogElement.prototype.showModal) {
		HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
			this.setAttribute("open", "");
		};
	}
	if (!HTMLDialogElement.prototype.close) {
		HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
			this.removeAttribute("open");
			this.dispatchEvent(new Event("close"));
		};
	}
});

function sampleRecipe(overrides: Partial<RecipeSummary> = {}): RecipeSummary {
	return {
		id: 1,
		name: "Draft name",
		goal: "Goal",
		state: "Draft",
		sourceTrainingRunId: null,
		qualifiedByJobId: 5,
		replacesRecipeId: null,
		definition: { schemaVersion: 1, inputs: {}, outputs: {}, steps: [], recoveries: [] },
		...overrides
	};
}

const LIVE = sampleRecipe({ id: 2, name: "Live recipe", state: "Published" });

describe("PublishRecipeModal", () => {
	beforeEach(() => {
		vi.mocked(publishRecipe).mockReset();
	});

	it("defaults the name to the draft's name with no replacement", () => {
		render(PublishRecipeModal, { open: true, onClose: vi.fn(), onPublished: vi.fn(), recipe: sampleRecipe(), publishedRecipes: [LIVE] });

		expect(screen.getByLabelText("Name")).toHaveValue("Draft name");
		expect((screen.getByLabelText("Replaces") as HTMLSelectElement).selectedOptions[0]).toHaveTextContent("None (new Recipe)");
	});

	it("defaults the name to the replaced Recipe's name when one is chosen", async () => {
		render(PublishRecipeModal, { open: true, onClose: vi.fn(), onPublished: vi.fn(), recipe: sampleRecipe(), publishedRecipes: [LIVE] });

		await fireEvent.change(screen.getByLabelText("Replaces"), { target: { value: "2" } });

		expect(screen.getByLabelText("Name")).toHaveValue("Live recipe");
	});

	it("restores the draft's name when the replacement is cleared", async () => {
		render(PublishRecipeModal, { open: true, onClose: vi.fn(), onPublished: vi.fn(), recipe: sampleRecipe(), publishedRecipes: [LIVE] });
		await fireEvent.change(screen.getByLabelText("Replaces"), { target: { value: "2" } });

		await fireEvent.change(screen.getByLabelText("Replaces"), { target: { value: "" } });

		expect(screen.getByLabelText("Name")).toHaveValue("Draft name");
	});

	it("publishes a new Recipe with a trimmed name, then closes and reports success", async () => {
		vi.mocked(publishRecipe).mockResolvedValue(sampleRecipe({ state: "Published" }));
		const onPublished = vi.fn();
		render(PublishRecipeModal, { open: true, onClose: vi.fn(), onPublished, recipe: sampleRecipe(), publishedRecipes: [LIVE] });

		await fireEvent.input(screen.getByLabelText("Name"), { target: { value: "  Final  " } });
		await fireEvent.click(screen.getByRole("button", { name: "Publish" }));

		await waitFor(() => expect(onPublished).toHaveBeenCalled());
		expect(publishRecipe).toHaveBeenCalledWith(1, { name: "Final" });
	});

	it("publishes with the chosen replacement", async () => {
		vi.mocked(publishRecipe).mockResolvedValue(sampleRecipe({ state: "Published" }));
		render(PublishRecipeModal, { open: true, onClose: vi.fn(), onPublished: vi.fn(), recipe: sampleRecipe(), publishedRecipes: [LIVE] });

		await fireEvent.change(screen.getByLabelText("Replaces"), { target: { value: "2" } });
		await fireEvent.click(screen.getByRole("button", { name: "Publish" }));

		await waitFor(() => expect(publishRecipe).toHaveBeenCalledWith(1, { name: "Live recipe", replacesRecipeId: 2 }));
	});

	it("requires a name without calling the server", async () => {
		render(PublishRecipeModal, { open: true, onClose: vi.fn(), onPublished: vi.fn(), recipe: sampleRecipe(), publishedRecipes: [] });

		await fireEvent.input(screen.getByLabelText("Name"), { target: { value: "   " } });
		await fireEvent.click(screen.getByRole("button", { name: "Publish" }));

		expect(screen.getByText("Name is required.")).toBeInTheDocument();
		expect(publishRecipe).not.toHaveBeenCalled();
	});

	it("shows the server's error and stays open", async () => {
		vi.mocked(publishRecipe).mockRejectedValue(new Error("Recipe 2 is no longer published"));
		const onPublished = vi.fn();
		render(PublishRecipeModal, { open: true, onClose: vi.fn(), onPublished, recipe: sampleRecipe(), publishedRecipes: [] });

		await fireEvent.click(screen.getByRole("button", { name: "Publish" }));

		expect(await screen.findByText("Recipe 2 is no longer published")).toBeInTheDocument();
		expect(onPublished).not.toHaveBeenCalled();
	});

	it("falls back to a generic message for a non-Error rejection", async () => {
		vi.mocked(publishRecipe).mockRejectedValue("boom");
		render(PublishRecipeModal, { open: true, onClose: vi.fn(), onPublished: vi.fn(), recipe: sampleRecipe(), publishedRecipes: [] });

		await fireEvent.click(screen.getByRole("button", { name: "Publish" }));

		expect(await screen.findByText("Failed to publish.")).toBeInTheDocument();
	});

	it("closes on Cancel", async () => {
		const onClose = vi.fn();
		render(PublishRecipeModal, { open: true, onClose, onPublished: vi.fn(), recipe: sampleRecipe(), publishedRecipes: [] });

		await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

		expect(onClose).toHaveBeenCalled();
	});
});
