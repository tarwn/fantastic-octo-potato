import { expect, test } from "@playwright/test";

import { getLlmRequestCount, resetLlmStub, scriptLlmResponses } from "./llm-stub/client";
import {
	compiledRecipeResponses,
	fetchRecipes,
	findBambooInvoiceApp,
	ingredientsResponse,
	loginAndCopyClientNameSteps,
	pollJobStatus,
	spawnRunner,
	TARGET_APP_URL
} from "./training-run-helpers";

// End-to-end guard for spec 0011 (R006): a Training Run's draft Recipe is qualified by a
// successful Trial, published from the Hub UI, then run in an Execute Job with a changed
// ingredient — with zero LLM calls after Training finished.

const SEEDED_CLIENT_NAME = "Contoso Consulting";

test.describe("train, Trial, publish, and Execute a Recipe (spec 0011)", () => {
	test.describe.configure({ timeout: 480_000 });

	test.beforeEach(async () => {
		await resetLlmStub();
	});

	test("a draft Recipe is qualified by a Trial, published, and executed with changed inputs without any LLM calls", async ({
		request,
		page,
		baseURL
	}) => {
		if (!baseURL) {
			throw new Error("baseURL is not set");
		}

		await scriptLlmResponses([ingredientsResponse(), ...loginAndCopyClientNameSteps(), ...compiledRecipeResponses()]);

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
			const trainingJobId = Number(/\/jobs\/(\d+)/.exec(page.url())?.[1]);
			await pollJobStatus(request, trainingJobId, "Completed-Success", 90_000, expect);
			const llmRequestsAfterTraining = await getLlmRequestCount();

			const draft = (await fetchRecipes(request, bambooInvoice.id)).find((recipe) => recipe.sourceTrainingRunId === String(trainingJobId));
			if (!draft) {
				throw new Error("no draft Recipe was created from the completed Training Run");
			}

			await page.goto(`/registered-applications/${bambooInvoice.id}/recipes/${draft.id}`);
			await expect(page.getByText("Not yet qualified")).toBeVisible();
			await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();

			const trialResponse = await request.post(`/api/hub/jobs/new/recipes/${draft.id}`, {
				data: { mode: "Trial", ingredients: { startingUrl: TARGET_APP_URL, invoiceNumber: "INV-1001" } }
			});
			expect(trialResponse.status()).toBe(201);
			const { data: trial } = (await trialResponse.json()) as { data: { id: number } };
			await pollJobStatus(request, trial.id, "Completed-Success", 90_000, expect);

			await page.reload();
			await expect(page.getByRole("link", { name: "Trial passed" })).toHaveAttribute("href", `/jobs/${trial.id}`);
			await page.getByRole("button", { name: "Publish" }).click();
			// Renamed so the published Recipe does not share the generated draft name that other specs look up by name.
			await page.getByRole("dialog").getByLabel("Name").fill("Published by recipe-publish e2e");
			await page.getByRole("dialog").getByRole("button", { name: "Publish" }).click();
			await expect(page.getByText("Published", { exact: true })).toBeVisible();

			const executeResponse = await request.post(`/api/hub/jobs/new/recipes/${draft.id}`, {
				data: { mode: "Execute", ingredients: { startingUrl: TARGET_APP_URL, invoiceNumber: "INV-2002" } }
			});
			expect(executeResponse.status()).toBe(201);
			const { data: execute } = (await executeResponse.json()) as { data: { id: number } };
			const executeDetail = await pollJobStatus(request, execute.id, "Completed-Success", 90_000, expect);

			expect(executeDetail).toEqual(
				expect.objectContaining({ results: expect.arrayContaining([expect.objectContaining({ fieldName: "clientName", safeValue: SEEDED_CLIENT_NAME })]) })
			);
			expect(await getLlmRequestCount()).toBe(llmRequestsAfterTraining);
		}
		finally {
			runner.kill();
		}
	});
});
