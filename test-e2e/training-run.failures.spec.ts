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
	TARGET_APP_URL } from "./training-run-helpers";

// End-to-end guards for spec 0009's Training Run failure/correction outcomes (Step 1 of
// docs/specs/0009-training-run/plan.md, R003/R005). See training-run.spec.ts for the shared setup
// and the happy-path guard, and training-run-helpers.ts for the assumed LLM response contract.
// Red until Step 7 lands — see training-run.spec.ts's header comment for why.

test.describe("training run failure and correction outcomes (spec 0009)", () => {
	test.describe.configure({ timeout: 300_000 });

	test.beforeEach(async () => {
		await resetLlmStub();
	});

	test("maxSteps too low reaches Completed-Failed and produces no Recipe", async ({ request, baseURL }) => {
		if (!baseURL) {
			throw new Error("baseURL is not set");
		}

		// Only the initial system-authored "open" Step (training-run.md's Runner exchange) runs
		// before the cap is hit — no next-Step call is needed, only the Ingredients extraction.
		await scriptLlmResponses([ingredientsResponse()]);

		const output: string[] = [];
		const runner = spawnRunner(baseURL, output);
		const goal = "Training run that never gets a chance to finish";

		try {
			const bambooInvoice = await findBambooInvoiceApp(request);

			const createResponse = await request.post(`/api/hub/registered-applications/${bambooInvoice.id}/jobs`, {
				data: { goal, startingUrl: TARGET_APP_URL, maxSteps: 1 }
			});
			expect(createResponse.status()).toBe(201);
			const { data: created } = (await createResponse.json()) as { data: { id: number } };

			await pollJobStatus(request, created.id, "Completed-Failed", 60_000, expect);

			const recipes = await fetchRecipes(request, bambooInvoice.id);
			expect(recipes.find((recipe) => recipe.goal === goal)).toBeUndefined();
		}
		finally {
			runner.kill();
		}
	});

	test("one invalid Step response is corrected via retry and the run still completes", async ({ request, baseURL }) => {
		if (!baseURL) {
			throw new Error("baseURL is not set");
		}

		const [firstLoginStep, ...remainingSteps] = loginAndCopyClientNameSteps();
		await scriptLlmResponses([
			ingredientsResponse(),
			{ content: "not a valid JSON Step" },
			firstLoginStep,
			...remainingSteps,
			compiledRecipeResponse()
		]);

		const output: string[] = [];
		const runner = spawnRunner(baseURL, output);
		const goal = "Training run with one corrected Step response";

		try {
			const bambooInvoice = await findBambooInvoiceApp(request);

			const createResponse = await request.post(`/api/hub/registered-applications/${bambooInvoice.id}/jobs`, {
				data: { goal, startingUrl: TARGET_APP_URL, maxSteps: 15 }
			});
			expect(createResponse.status()).toBe(201);
			const { data: created } = (await createResponse.json()) as { data: { id: number } };

			await pollJobStatus(request, created.id, "Completed-Success", 90_000, expect);

			const recipes = await fetchRecipes(request, bambooInvoice.id);
			expect(recipes.find((recipe) => recipe.goal === goal)).toBeDefined();
		}
		finally {
			runner.kill();
		}
	});

	test("every Step response invalid reaches Completed-Error and produces no Recipe", async ({ request, baseURL }) => {
		if (!baseURL) {
			throw new Error("baseURL is not set");
		}

		await scriptLlmResponses([
			ingredientsResponse(),
			// Comfortably exceeds any reasonable bounded-retry count (R003).
			...Array.from({ length: 10 }, () => ({ content: "still not a valid JSON Step" }))
		]);

		const output: string[] = [];
		const runner = spawnRunner(baseURL, output);
		const goal = "Training run where every Step response is invalid";

		try {
			const bambooInvoice = await findBambooInvoiceApp(request);

			const createResponse = await request.post(`/api/hub/registered-applications/${bambooInvoice.id}/jobs`, {
				data: { goal, startingUrl: TARGET_APP_URL, maxSteps: 15 }
			});
			expect(createResponse.status()).toBe(201);
			const { data: created } = (await createResponse.json()) as { data: { id: number } };

			await pollJobStatus(request, created.id, "Completed-Error", 60_000, expect);

			const recipes = await fetchRecipes(request, bambooInvoice.id);
			expect(recipes.find((recipe) => recipe.goal === goal)).toBeUndefined();
		}
		finally {
			runner.kill();
		}
	});
});
