import { expect, test } from "@playwright/test";

import { resetLlmStub, scriptLlmResponses } from "./llm-stub/client";
import {
	compiledRecipeResponse,
	fetchRecipes,
	findBambooInvoiceApp,
	ingredientsResponse,
	loginAndCopyClientNameSteps,
	pollJobStatus,
	spawnRunner,
	TARGET_APP_URL
} from "./training-run-helpers";

// End-to-end guard for spec 0009's full happy-path Training Run (Step 1 of
// docs/specs/0009-training-run/plan.md). See training-run-helpers.ts for the assumed LLM response
// contract and training-run.failures.spec.ts for the maxSteps/invalid-response scenarios.
// Red until Step 7 lands — Steps 2-6 (Hub LLM client, both prompts, the real Runner Training loop,
// and Recipe compilation) don't exist yet, so this hits the still-scripted stand-in
// (scriptedTrainingSteps.ts) instead. That's expected per the plan's sequencing note.

test.describe("training run against a real target application (spec 0009)", () => {
	// globalSetup.ts builds/starts target-app and the LLM stub once for the whole run; real browser
	// automation against BambooInvoice across several Training steps is nowhere near the default 30s.
	test.describe.configure({ timeout: 300_000 });

	test.beforeEach(async () => {
		await resetLlmStub();
	});

	test("a completed Training Run produces a draft Recipe visible on the Registered Application screen", async ({
		request,
		page,
		baseURL
	}) => {
		if (!baseURL) {
			throw new Error("baseURL is not set");
		}

		await scriptLlmResponses([ingredientsResponse(), ...loginAndCopyClientNameSteps(), compiledRecipeResponse()]);

		const output: string[] = [];
		const runner = spawnRunner(baseURL, output);

		try {
			const bambooInvoice = await findBambooInvoiceApp(request);

			await page.goto(`/registered-applications/${bambooInvoice.id}`);
			await page.getByRole("button", { name: "Begin a Training Run" }).click();
			await page.getByLabel("Primary goal statement").fill("Log in and copy the seeded invoice's client name");
			await page.getByLabel("Starting URL").fill(TARGET_APP_URL);
			await page.getByLabel("Maximum steps").fill("15");
			await page.getByRole("button", { name: "Start Training Run" }).click();

			await expect(page).toHaveURL(/\/jobs\/\d+/);
			const jobId = Number(/\/jobs\/(\d+)/.exec(page.url())?.[1]);

			// Transcript entries accumulate on the Job screen as the Runner executes real Steps.
			await expect
				.poll(
					async () => {
						await page.reload();
						return page.getByText("Copy the client name").isVisible();
					},
					{ timeout: 60_000 }
				)
				.toBe(true);

			const jobDetail = await pollJobStatus(request, jobId, "Completed-Success", 90_000, expect);
			// R004: the Runner reports a masked screenshot per Training step, same as a Recipe Job.
			expect(jobDetail.artifacts.length).toBeGreaterThan(0);

			const recipes = await fetchRecipes(request, bambooInvoice.id);
			const draftRecipe = recipes.find((recipe) => recipe.state === "Draft");
			if (!draftRecipe) {
				throw new Error("no draft Recipe was created from the completed Training Run");
			}
			expect(draftRecipe.definition.inputs).toHaveProperty("invoiceNumber");
			expect(draftRecipe.definition.outputs).toHaveProperty("clientName");
			expect(draftRecipe.definition.steps.length).toBeGreaterThan(0);

			await page.goto(`/registered-applications/${bambooInvoice.id}`);
			await expect(page.getByRole("link", { name: draftRecipe.name })).toBeVisible();
			await expect(page.getByRole("button", { name: "Start Trial" }).first()).toBeVisible();

			await page.getByRole("link", { name: draftRecipe.name }).click();
			await expect(page.getByText("invoiceNumber")).toBeVisible();
			await expect(page.getByText("clientName")).toBeVisible();
			await expect(page.getByText("Copy the client name")).toBeVisible();
		}
		finally {
			runner.kill();
		}
	});
});
