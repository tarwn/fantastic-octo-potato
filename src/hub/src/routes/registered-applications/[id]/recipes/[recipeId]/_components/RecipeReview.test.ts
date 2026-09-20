import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import RecipeReview from "./RecipeReview.svelte";

import type { RecipeDefinition } from "$lib/types/recipeDefinition";

function sampleDefinition(overrides: Partial<RecipeDefinition> = {}): RecipeDefinition {
	return {
		schemaVersion: 1,
		inputs: {
			invoiceNumber: { type: "string", description: "Invoice to look up", required: true, nullable: false, sensitive: false }
		},
		outputs: {
			clientName: { type: "string", description: "Client on the invoice", required: true, nullable: false, sensitive: false }
		},
		steps: [
			{ id: "start", action: "open", args: ["https://example.test"], intent: "Open the app" },
			{ id: "risky", action: "click", args: [{ by: "css", value: "#submit" }], intent: "Submit the form", irreversible: true }
		],
		recoveries: [],
		...overrides
	};
}

const baseProps = { name: "Read invoice", goal: "Look up an invoice", state: "Draft" as const, qualifiedByJobId: null, onPublish: vi.fn() };

describe("RecipeReview", () => {
	it("renders the Recipe's name and goal", () => {
		render(RecipeReview, { ...baseProps, definition: sampleDefinition() });

		expect(screen.getByText("Read invoice")).toBeInTheDocument();
		expect(screen.getByText("Look up an invoice")).toBeInTheDocument();
	});

	it("lists each Step's intent", () => {
		render(RecipeReview, { ...baseProps, definition: sampleDefinition() });

		expect(screen.getByText("Open the app")).toBeInTheDocument();
		expect(screen.getByText("Submit the form")).toBeInTheDocument();
	});

	it("shows an irreversible badge only for a Step marked irreversible", () => {
		render(RecipeReview, { ...baseProps, definition: sampleDefinition() });

		expect(screen.getAllByText("Irreversible")).toHaveLength(1);
	});

	it("lists input and output field names with sensitivity", () => {
		render(RecipeReview, {
			...baseProps,
			definition: sampleDefinition({
				inputs: {
					accountId: { type: "string", description: "Account", required: true, nullable: false, sensitive: true }
				}
			})
		});

		expect(screen.getByText("accountId")).toBeInTheDocument();
		expect(screen.getByText("clientName")).toBeInTheDocument();
		expect(screen.getByText("Sensitive")).toBeInTheDocument();
	});

	it("shows a draft without a successful Trial as not yet qualified, with Publish disabled", () => {
		render(RecipeReview, { ...baseProps, definition: sampleDefinition() });

		expect(screen.getByText("Not yet qualified")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
	});

	it("shows a qualified draft as Trial passed and calls onPublish from an enabled Publish", async () => {
		const onPublish = vi.fn();
		render(RecipeReview, { ...baseProps, qualifiedByJobId: 4, onPublish, definition: sampleDefinition() });

		expect(screen.getByRole("link", { name: "Trial passed" })).toHaveAttribute("href", "/jobs/4");
		await fireEvent.click(screen.getByRole("button", { name: "Publish" }));

		expect(onPublish).toHaveBeenCalled();
	});

	it("shows Published and Archived Recipes by state with no Publish action", () => {
		const { unmount } = render(RecipeReview, { ...baseProps, state: "Published", qualifiedByJobId: 4, definition: sampleDefinition() });
		expect(screen.getByText("Published")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
		unmount();

		render(RecipeReview, { ...baseProps, state: "Archived", qualifiedByJobId: 4, definition: sampleDefinition() });
		expect(screen.getByText("Archived")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
	});
});
