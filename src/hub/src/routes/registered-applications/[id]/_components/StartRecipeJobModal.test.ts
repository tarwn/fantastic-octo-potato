import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import StartRecipeJobModal from "./StartRecipeJobModal.svelte";

import { goto } from "$app/navigation";
import { fetchRecipes, type RecipeSummary, startRecipeJob } from "$lib/api/recipesApi";
import { JobType } from "$lib/jobType";

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$lib/api/recipesApi", () => ({ fetchRecipes: vi.fn(), startRecipeJob: vi.fn() }));

// jsdom recognizes <dialog> but doesn't implement showModal()/close() (only the
// `open` attribute reflection), so polyfill them for this component's tests.
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

const DRAFT_RECIPE: RecipeSummary = {
	id: 1,
	name: "Draft recipe",
	goal: "Goal",
	state: "Draft",
	sourceTrainingRunId: null,
		qualifiedByJobId: null,
		replacesRecipeId: null,
	definition: {
		schemaVersion: 1,
		inputs: {
			accountQuery: { type: "string", description: "Account to search", required: true, nullable: false, sensitive: false }
		},
		outputs: {},
		steps: [
			{ id: "start", action: "open", args: ["https://example.test"], intent: "Open the app" },
			{ id: "risky", action: "click", args: [{ by: "css", value: "#submit" }], intent: "Submit the form", irreversible: true }
		],
		recoveries: []
	}
};

const PUBLISHED_RECIPE: RecipeSummary = { ...DRAFT_RECIPE, id: 2, name: "Published recipe", state: "Published" };

const TYPED_RECIPE: RecipeSummary = {
	id: 3,
	name: "Typed recipe",
	goal: "Goal",
	state: "Draft",
	sourceTrainingRunId: null,
		qualifiedByJobId: null,
		replacesRecipeId: null,
	definition: {
		schemaVersion: 1,
		inputs: {
			retries: { type: "number", description: "Retry count", required: true, nullable: false, sensitive: false },
			status: { type: "string", description: "Status", required: true, nullable: false, sensitive: false, enum: ["found", "not_found"] }
		},
		outputs: {},
		steps: [{ id: "start", action: "open", args: ["https://example.test"], intent: "Open the app" }],
		recoveries: []
	}
};

const BOOLEAN_RECIPE: RecipeSummary = {
	id: 4,
	name: "Boolean recipe",
	goal: "Goal",
	state: "Draft",
	sourceTrainingRunId: null,
		qualifiedByJobId: null,
		replacesRecipeId: null,
	definition: {
		schemaVersion: 1,
		inputs: { confirmed: { type: "boolean", description: "Confirm the search", required: true, nullable: false, sensitive: false } },
		outputs: {},
		steps: [{ id: "start", action: "open", args: ["https://example.test"], intent: "Open the app" }],
		recoveries: []
	}
};

describe("StartRecipeJobModal", () => {
	beforeEach(() => {
		vi.mocked(fetchRecipes).mockReset();
		vi.mocked(startRecipeJob).mockReset();
		vi.mocked(goto).mockReset();
		vi.mocked(fetchRecipes).mockResolvedValue([DRAFT_RECIPE, PUBLISHED_RECIPE]);
	});

	it("lists only draft Recipes for Start Trial", async () => {
		render(StartRecipeJobModal, { open: true, onClose: vi.fn(), registeredApplicationId: 1, mode: "Trial" });

		expect(await screen.findByText("Draft recipe")).toBeInTheDocument();
		expect(screen.queryByText("Published recipe")).not.toBeInTheDocument();
	});

	it("lists only published Recipes for Start Job", async () => {
		render(StartRecipeJobModal, { open: true, onClose: vi.fn(), registeredApplicationId: 1, mode: "Execute" });

		expect(await screen.findByText("Published recipe")).toBeInTheDocument();
		expect(screen.queryByText("Draft recipe")).not.toBeInTheDocument();
	});

	it("shows a loading message, not the empty state, until Recipes have loaded", async () => {
		let resolveFetch: (recipes: RecipeSummary[]) => void = () => {};
		vi.mocked(fetchRecipes).mockReturnValue(new Promise((resolve) => (resolveFetch = resolve)));
		render(StartRecipeJobModal, { open: true, onClose: vi.fn(), registeredApplicationId: 1, mode: "Trial" });

		expect(await screen.findByText("Loading Recipes...")).toBeInTheDocument();
		expect(screen.queryByText(/Recipes are available/)).not.toBeInTheDocument();

		resolveFetch([]);

		expect(await screen.findByText("No draft Recipes are available.")).toBeInTheDocument();
		expect(screen.queryByText("Loading Recipes...")).not.toBeInTheDocument();
	});

	it("shows an irreversible badge for a Step marked irreversible", async () => {
		render(StartRecipeJobModal, { open: true, onClose: vi.fn(), registeredApplicationId: 1, mode: "Trial" });

		expect(await screen.findByText("Irreversible")).toBeInTheDocument();
	});

	it("rejects submission missing a required Ingredient", async () => {
		render(StartRecipeJobModal, { open: true, onClose: vi.fn(), registeredApplicationId: 1, mode: "Trial" });
		await screen.findByText("Draft recipe");

		await fireEvent.click(screen.getByRole("button", { name: "Start Trial" }));

		expect(await screen.findByText(/accountQuery is required/i)).toBeInTheDocument();
		expect(startRecipeJob).not.toHaveBeenCalled();
	});

	it("submits the Recipe Job and navigates to the new Job's detail page", async () => {
		vi.mocked(startRecipeJob).mockResolvedValue({
			id: 42,
			customerApplicationXrefId: 1,
			jobType: JobType.Recipe,
			name: "Draft recipe",
			jobStatusId: 1,
			details: { recipeId: 1, mode: "Trial", allowlist: "https://example.test", stepTimeoutMs: 15000 },
			runnerId: null,
			createdAt: new Date(),
			startedAt: null,
			heartbeatOn: null,
			completedAt: null
		});
		render(StartRecipeJobModal, { open: true, onClose: vi.fn(), registeredApplicationId: 1, mode: "Trial" });
		await screen.findByText("Draft recipe");

		await fireEvent.input(screen.getByLabelText(/accountQuery/i), { target: { value: "ACCT-1042" } });
		await fireEvent.click(screen.getByRole("button", { name: "Start Trial" }));

		expect(startRecipeJob).toHaveBeenCalledWith(1, { mode: "Trial", ingredients: { accountQuery: "ACCT-1042" } });
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith("/jobs/42"));
	});

	it("shows the load error inline when fetching Recipes fails", async () => {
		vi.mocked(fetchRecipes).mockReset();
		vi.mocked(fetchRecipes).mockRejectedValue(new Error("Registered Application 1 not found"));

		render(StartRecipeJobModal, { open: true, onClose: vi.fn(), registeredApplicationId: 1, mode: "Trial" });

		expect(await screen.findByText("Registered Application 1 not found")).toBeInTheDocument();
	});

	it("shows a server error inline instead of navigating when the submit call fails", async () => {
		vi.mocked(startRecipeJob).mockRejectedValue(new Error("Recipe 1 not found"));
		render(StartRecipeJobModal, { open: true, onClose: vi.fn(), registeredApplicationId: 1, mode: "Trial" });
		await screen.findByText("Draft recipe");

		await fireEvent.input(screen.getByLabelText(/accountQuery/i), { target: { value: "ACCT-1042" } });
		await fireEvent.click(screen.getByRole("button", { name: "Start Trial" }));

		expect(await screen.findByText("Recipe 1 not found")).toBeInTheDocument();
		expect(goto).not.toHaveBeenCalled();
	});

	it("rejects a non-numeric value on a number-typed field", async () => {
		vi.mocked(fetchRecipes).mockReset();
		vi.mocked(fetchRecipes).mockResolvedValue([TYPED_RECIPE]);
		render(StartRecipeJobModal, { open: true, onClose: vi.fn(), registeredApplicationId: 1, mode: "Trial" });
		await screen.findByText("Typed recipe");

		await fireEvent.input(screen.getByLabelText(/retries/i), { target: { value: "not-a-number" } });
		await fireEvent.input(screen.getByLabelText(/status/i), { target: { value: "found" } });
		await fireEvent.click(screen.getByRole("button", { name: "Start Trial" }));

		expect(await screen.findByText(/retries must be a number/i)).toBeInTheDocument();
		expect(startRecipeJob).not.toHaveBeenCalled();
	});

	it("rejects a value outside a field's declared enum", async () => {
		vi.mocked(fetchRecipes).mockReset();
		vi.mocked(fetchRecipes).mockResolvedValue([TYPED_RECIPE]);
		render(StartRecipeJobModal, { open: true, onClose: vi.fn(), registeredApplicationId: 1, mode: "Trial" });
		await screen.findByText("Typed recipe");

		await fireEvent.input(screen.getByLabelText(/retries/i), { target: { value: "3" } });
		await fireEvent.input(screen.getByLabelText(/status/i), { target: { value: "bogus" } });
		await fireEvent.click(screen.getByRole("button", { name: "Start Trial" }));

		expect(await screen.findByText(/status must be one of: found, not_found/i)).toBeInTheDocument();
		expect(startRecipeJob).not.toHaveBeenCalled();
	});

	it("renders a boolean Ingredient as a checkbox and submits its unchecked default as false", async () => {
		vi.mocked(fetchRecipes).mockReset();
		vi.mocked(fetchRecipes).mockResolvedValue([BOOLEAN_RECIPE]);
		render(StartRecipeJobModal, { open: true, onClose: vi.fn(), registeredApplicationId: 1, mode: "Trial" });
		await screen.findByText("Boolean recipe");

		expect(screen.getByLabelText(/confirmed/i)).toHaveAttribute("type", "checkbox");

		await fireEvent.click(screen.getByRole("button", { name: "Start Trial" }));

		expect(startRecipeJob).toHaveBeenCalledWith(4, { mode: "Trial", ingredients: { confirmed: false } });
	});

	it("preselects the Recipe passed via initialRecipeId", async () => {
		vi.mocked(fetchRecipes).mockResolvedValue([DRAFT_RECIPE, { ...DRAFT_RECIPE, id: 5, name: "Other draft" }]);

		render(StartRecipeJobModal, { open: true, onClose: vi.fn(), registeredApplicationId: 1, mode: "Trial", initialRecipeId: 5 });

		await screen.findByText("Other draft");
		expect(screen.getByRole("combobox")).toHaveValue("5");
	});

	it("calls onClose when the cancel button is clicked", async () => {
		const onClose = vi.fn();
		render(StartRecipeJobModal, { open: true, onClose, registeredApplicationId: 1, mode: "Trial" });

		await fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

		expect(onClose).toHaveBeenCalledOnce();
	});
});
