import { expect, test } from "@playwright/test";

import { getLlmRequestCount, resetLlmStub, scriptLlmResponses } from "./llm-stub/client";
import {
	compiledRecipeResponse,
	fetchRecipes,
	findBambooInvoiceApp,
	ingredientsResponse,
	JOB_STATUS_LABELS,
	loginAndCopyClientNameSteps,
	pollJobStatus,
	spawnRunner,
	TARGET_APP_URL
} from "./training-run-helpers";

// End-to-end guards: a text block located by a contained label (exact:false) publishes only the
// captured field. Red until the runner supports substring targets and structured reads.

const SEEDED_AMOUNT = "$1200.00";

const AMOUNT_READ_ARGS = [
	{ by: "text", value: "Amount:", exact: false },
	{ source: "text", extract: { by: "regex", pattern: "Amount:\\s*(?<value>\\$[\\d,]+\\.\\d{2})", group: "value" }, parse: "string" },
	{ ref: "output", name: "amount" }
];

function stepsUpToInvoiceView(): { content: string }[] {
	return loginAndCopyClientNameSteps().slice(0, 6);
}

function finishAmountStep(): { content: string } {
	return {
		content: JSON.stringify({
			id: "train_finish",
			action: "finish",
			args: [null],
			intent: "Confirm the amount was collected"
		})
	};
}

function amountReadStep(id: string, args: unknown[]): { content: string } {
	return { content: JSON.stringify({ id, action: "read", args, intent: "Copy the invoice amount" }) };
}

// The stock compiled Recipe with its client-name read swapped for the structured amount read.
function compiledAmountRecipeResponse(): { content: string } {
	const recipe = JSON.parse(compiledRecipeResponse().content) as {
		outputs: Record<string, unknown>;
		steps: { id: string; args: unknown[]; intent: string }[];
	};
	recipe.outputs = {
		amount: { type: "string", description: "Invoice amount", required: true, nullable: false, sensitive: false }
	};
	recipe.steps = recipe.steps.map((step) => {
		if (step.id === "copy_client") {
			return { ...step, id: "read_amount", args: AMOUNT_READ_ARGS, intent: "Copy the invoice amount" };
		}
		if (step.id === "complete") {
			return { ...step, args: [{ test: "assigned", args: [{ ref: "output", name: "amount" }] }] };
		}
		return step;
	});
	return { content: JSON.stringify(recipe) };
}

test.describe("read substring extraction against a real target application", () => {
	test.describe.configure({ timeout: 480_000 });

	test.beforeEach(async () => {
		await resetLlmStub();
	});

	test("a Training Run captures only the amount, and the Recipe replays it with zero LLM calls", async ({
		request,
		baseURL
	}) => {
		if (!baseURL) {
			throw new Error("baseURL is not set");
		}

		await scriptLlmResponses([
			ingredientsResponse(),
			...stepsUpToInvoiceView(),
			amountReadStep("read_amount", AMOUNT_READ_ARGS),
			finishAmountStep(),
			compiledAmountRecipeResponse()
		]);

		const output: string[] = [];
		const runner = spawnRunner(baseURL, output);

		try {
			const bambooInvoice = await findBambooInvoiceApp(request);
			const createResponse = await request.post("/api/hub/jobs/new/training", {
				data: {
					goal: "Log in and copy the seeded invoice's amount",
					startingUrl: TARGET_APP_URL,
					maxSteps: 15,
					registeredApplicationId: bambooInvoice.id
				}
			});
			expect(createResponse.status()).toBe(201);
			const { data: training } = (await createResponse.json()) as { data: { id: number } };
			await pollJobStatus(request, training.id, "Completed-Success", 90_000, expect);
			const llmRequestsAfterTraining = await getLlmRequestCount();

			const draft = (await fetchRecipes(request, bambooInvoice.id)).find(
				(recipe) => recipe.sourceTrainingRunId === String(training.id)
			);
			if (!draft) {
				throw new Error("no draft Recipe was created from the completed Training Run");
			}

			const trialResponse = await request.post(`/api/hub/jobs/new/recipes/${draft.id}`, {
				data: { mode: "Trial", ingredients: { startingUrl: TARGET_APP_URL, invoiceNumber: "INV-1001" } }
			});
			expect(trialResponse.status()).toBe(201);
			const { data: trial } = (await trialResponse.json()) as { data: { id: number } };
			const trialDetail = await pollJobStatus(request, trial.id, "Completed-Success", 90_000, expect);

			expect(trialDetail).toEqual(
				expect.objectContaining({
					results: expect.arrayContaining([expect.objectContaining({ fieldName: "amount", safeValue: SEEDED_AMOUNT })])
				})
			);
			expect(await getLlmRequestCount()).toBe(llmRequestsAfterTraining);
		}
		finally {
			runner.kill();
		}
	});

	test("a substring matching several elements fails as ambiguous and assigns no output", async ({ request, baseURL }) => {
		if (!baseURL) {
			throw new Error("baseURL is not set");
		}

		const ambiguousArgs = [{ ...AMOUNT_READ_ARGS[0], value: ":" }, AMOUNT_READ_ARGS[1], AMOUNT_READ_ARGS[2]];
		await scriptLlmResponses([
			ingredientsResponse(),
			...stepsUpToInvoiceView(),
			amountReadStep("read_ambiguous", ambiguousArgs),
			// Enough corrections to exhaust the run's failure budget without a successful read.
			...Array.from({ length: 10 }, () => amountReadStep("read_ambiguous", ambiguousArgs))
		]);

		const output: string[] = [];
		const runner = spawnRunner(baseURL, output);

		try {
			const bambooInvoice = await findBambooInvoiceApp(request);
			const createResponse = await request.post("/api/hub/jobs/new/training", {
				data: {
					goal: "Copy the amount with an ambiguous label",
					startingUrl: TARGET_APP_URL,
					maxSteps: 15,
					registeredApplicationId: bambooInvoice.id
				}
			});
			expect(createResponse.status()).toBe(201);
			const { data: training } = (await createResponse.json()) as { data: { id: number } };

			await expect
				.poll(async () => {
					const body = (await (await request.get(`/api/hub/jobs/${training.id}`)).json()) as {
						data: { jobStatusId: number; transcript: unknown[]; results: unknown[] };
					};
					const ended = ["Completed-Failed", "Completed-Error"].includes(JOB_STATUS_LABELS[body.data.jobStatusId]);
					const transcript = JSON.stringify(body.data.transcript);
					return ended && transcript.includes("read_ambiguous") && transcript.includes("TARGET_AMBIGUOUS") && body.data.results.length === 0;
				}, { timeout: 90_000 })
				.toBe(true);
		}
		finally {
			runner.kill();
		}
	});
});
