import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

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

describe("RecipeReview", () => {
	it("renders the Recipe's name and goal", () => {
		render(RecipeReview, { name: "Read invoice", goal: "Look up an invoice", definition: sampleDefinition() });

		expect(screen.getByText("Read invoice")).toBeInTheDocument();
		expect(screen.getByText("Look up an invoice")).toBeInTheDocument();
	});

	it("lists each Step's intent", () => {
		render(RecipeReview, { name: "Read invoice", goal: "Look up an invoice", definition: sampleDefinition() });

		expect(screen.getByText("Open the app")).toBeInTheDocument();
		expect(screen.getByText("Submit the form")).toBeInTheDocument();
	});

	it("shows an irreversible badge only for a Step marked irreversible", () => {
		render(RecipeReview, { name: "Read invoice", goal: "Look up an invoice", definition: sampleDefinition() });

		expect(screen.getAllByText("Irreversible")).toHaveLength(1);
	});

	it("lists input and output field names with sensitivity", () => {
		render(RecipeReview, {
			name: "Read invoice",
			goal: "Look up an invoice",
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
});
