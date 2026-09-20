import { beforeEach, describe, expect, it, vi } from "vitest";

import { SensitivityType } from "../storage/db/sensitivityType";

import { sendChatCompletion } from "./llmClient";
import type { RecipeCompilationContext } from "./recipeCompilation";

vi.mock("./llmClient", () => ({ sendChatCompletion: vi.fn() }));

const mockedSendChatCompletion = vi.mocked(sendChatCompletion);

beforeEach(() => {
	mockedSendChatCompletion.mockReset();
});

function baseContext(overrides: Partial<RecipeCompilationContext> = {}): RecipeCompilationContext {
	return {
		goal: "Find the invoice total",
		transcriptSummary: "Step: opened https://example.com/start\nStep: read total (extracted: total=100)",
		journal: [
			{
				kind: "Step",
				outcome: "succeeded",
				outputs: [],
				step: {
					definition: { id: "open_starting_url", intent: "Open start", action: "open", args: [{ ref: "input", name: "startingUrl" }] },
					targetDescription: {} as never
				}
			}
		],
		ingredients: [{ fieldName: "startingUrl", safeValue: "https://example.com/start", sensitivityType: SensitivityType.None }],
		results: [{ fieldName: "total", safeValue: "100" }],
		credentialNames: [],
		...overrides
	};
}

const VALID_SCHEMA = {
	inputs: { startingUrl: { type: "string", description: "Where to start" } },
	outputs: { total: { type: "number", description: "Invoice total", required: true, nullable: false, sensitive: false } }
};

const VALID_STEPS = {
	steps: [
		{ id: "open_starting_url", intent: "Open start", action: "open", args: [{ ref: "input", name: "startingUrl" }] },
		{ id: "read_total", intent: "Read total", action: "read", args: [{ by: "text", value: "Total" }, "text", { ref: "output", name: "total" }] },
		{ id: "done", intent: "Finish", action: "finish", args: [null] }
	]
};

function respondWith(...responses: unknown[]): void {
	for (const response of responses) {
		mockedSendChatCompletion.mockResolvedValueOnce(typeof response === "string" ? response : JSON.stringify(response));
	}
}

async function compile(context = baseContext()) {
	const { compileRecipe } = await import("./recipeCompilation");
	return compileRecipe(context);
}

describe("compileRecipe", () => {
	it("compiles the schema call and the ideal Steps call into a RecipeDefinition with a deterministic finish checkpoint", async () => {
		respondWith(VALID_SCHEMA, VALID_STEPS);

		const result = await compile();

		expect(result).toEqual({
			schemaVersion: 1,
			inputs: { startingUrl: { type: "string", description: "Where to start", required: true, nullable: false, sensitive: false } },
			outputs: VALID_SCHEMA.outputs,
			steps: [
				VALID_STEPS.steps[0],
				VALID_STEPS.steps[1],
				{ id: "done", intent: "Finish", action: "finish", args: [{ test: "all", args: [{ test: "assigned", args: [{ ref: "output", name: "total" }] }] }] }
			],
			recoveries: []
		});
		expect(mockedSendChatCompletion).toHaveBeenCalledTimes(2);
	});

	it("gives the Steps call the schema's final outputs and the journal", async () => {
		respondWith(VALID_SCHEMA, VALID_STEPS);
		const context = baseContext();

		await compile(context);

		const stepsPrompt = JSON.parse(mockedSendChatCompletion.mock.calls[1][0].userPrompt);
		expect(stepsPrompt.outputs).toEqual(VALID_SCHEMA.outputs);
		expect(stepsPrompt.journal).toEqual(context.journal);
	});

	it("carries an Ingredient's already-known sensitivity through to the compiled input, not the LLM's opinion", async () => {
		respondWith(VALID_SCHEMA, VALID_STEPS);

		const result = await compile(baseContext({ ingredients: [{ fieldName: "startingUrl", safeValue: "••••••", sensitivityType: SensitivityType.PII }] }));

		expect(result.inputs.startingUrl.sensitive).toBe(true);
	});

	it("builds a trivially-satisfied checkpoint when there are no outputs", async () => {
		respondWith({ inputs: VALID_SCHEMA.inputs, outputs: {} }, { steps: [{ id: "s1", intent: "Finish", action: "finish", args: [null] }] });

		const result = await compile(baseContext({ results: [] }));

		expect(result.steps).toEqual([{ id: "s1", intent: "Finish", action: "finish", args: [{ test: "all", args: [] }] }]);
	});

	describe("schema call", () => {
		it("accepts a subset of the observed outputs, dropping the rest from the Recipe", async () => {
			respondWith(
				{ inputs: VALID_SCHEMA.inputs, outputs: {} },
				{ steps: [{ id: "s1", intent: "Finish", action: "finish", args: [null] }] }
			);

			const result = await compile();

			expect(result.outputs).toEqual({});
		});

		it("retries when the response is missing an input, and succeeds if the retry is valid", async () => {
			respondWith({ inputs: {}, outputs: VALID_SCHEMA.outputs }, VALID_SCHEMA, VALID_STEPS);

			const result = await compile();

			expect(result.inputs.startingUrl).toBeDefined();
			expect(mockedSendChatCompletion).toHaveBeenCalledTimes(3);
		});

		it("fails loudly, naming the stage, when the response invents an output that was never observed", async () => {
			const invented = {
				inputs: VALID_SCHEMA.inputs,
				outputs: { ...VALID_SCHEMA.outputs, extra: { type: "string", description: "x", required: true, nullable: false, sensitive: false } }
			};
			respondWith(invented, invented);
			const { RecipeCompilationInvalidResponseError } = await import("./recipeCompilation");

			const error: unknown = await compile().catch((err: unknown) => err);

			expect(error).toBeInstanceOf(RecipeCompilationInvalidResponseError);
			expect((error as Error).message).toContain("(schema)");
			expect(mockedSendChatCompletion).toHaveBeenCalledTimes(2);
		});

		it("fails loudly on a renamed output", async () => {
			const renamed = { inputs: VALID_SCHEMA.inputs, outputs: { grandTotal: VALID_SCHEMA.outputs.total } };
			respondWith(renamed, renamed);
			const { RecipeCompilationInvalidResponseError } = await import("./recipeCompilation");

			await expect(compile()).rejects.toThrow(RecipeCompilationInvalidResponseError);
		});

		it("truncates a long raw LLM response before it lands in the thrown error (and later the transcript)", async () => {
			mockedSendChatCompletion.mockResolvedValue(`not json, and quite long: ${"x".repeat(2000)}`);
			const { RecipeCompilationInvalidResponseError } = await import("./recipeCompilation");

			const error: unknown = await compile().catch((err: unknown) => err);

			expect(error).toBeInstanceOf(RecipeCompilationInvalidResponseError);
			expect((error as Error).message).toMatch(/… \(truncated\)$/);
			expect((error as Error).message.length).toBeLessThan(1150);
		});
	});

	describe("ideal Steps call", () => {
		it("replaces the executed Steps with the model's ideal Steps, allowing an if", async () => {
			const ideal = {
				steps: [
					{ id: "open_starting_url", intent: "Open start", action: "open", args: [{ ref: "input", name: "startingUrl" }] },
					{
						id: "maybe_dismiss",
						intent: "Dismiss banner",
						action: "if",
						args: [[{ when: { test: "exists", args: [{ by: "text", value: "Accept" }] }, steps: [{ id: "accept", intent: "Accept", action: "click", args: [{ by: "text", value: "Accept" }] }] }], []]
					},
					VALID_STEPS.steps[1],
					VALID_STEPS.steps[2]
				]
			};
			respondWith(VALID_SCHEMA, ideal);

			const result = await compile();

			expect(result.steps.map((step) => step.id)).toEqual(["open_starting_url", "maybe_dismiss", "read_total", "done"]);
		});

		it("rejects, then retries, Steps referencing an output the schema call dropped", async () => {
			respondWith({ inputs: VALID_SCHEMA.inputs, outputs: {} }, VALID_STEPS, { steps: [{ id: "s1", intent: "Finish", action: "finish", args: [null] }] });

			const result = await compile();

			expect(result.steps).toHaveLength(1);
			expect(mockedSendChatCompletion).toHaveBeenCalledTimes(3);
		});

		it("accepts a Step referencing a credential name the Training run reported", async () => {
			const withCredential = {
				steps: [
					{ id: "fill_user", intent: "Fill user", action: "fill", args: [{ by: "label", value: "Username" }, { ref: "credential", name: "loginUser" }] },
					VALID_STEPS.steps[2]
				]
			};
			respondWith(VALID_SCHEMA, withCredential);

			const result = await compile(baseContext({ credentialNames: ["loginUser"] }));

			expect(result.steps[0].id).toBe("fill_user");
		});

		it("fails loudly, naming the stage, when a Step references a credential the Training run never reported", async () => {
			const guessed = {
				steps: [
					{ id: "fill_user", intent: "Fill user", action: "fill", args: [{ by: "label", value: "Username" }, { ref: "credential", name: "guessed" }] },
					VALID_STEPS.steps[2]
				]
			};
			respondWith(VALID_SCHEMA, guessed, guessed);
			const { RecipeCompilationInvalidResponseError } = await import("./recipeCompilation");

			const error: unknown = await compile(baseContext({ credentialNames: ["loginUser"] })).catch((err: unknown) => err);

			expect(error).toBeInstanceOf(RecipeCompilationInvalidResponseError);
			expect((error as Error).message).toContain("(steps)");
		});

		it.each([
			["a Step has no intent", { steps: [{ id: "click_go", action: "click", args: [{ by: "text", value: "Go" }] }, VALID_STEPS.steps[2]] }],
			[
				"a nested Step has no intent",
				{
					steps: [
						{ id: "grp", intent: "Group", action: "group", args: [[{ id: "click_go", action: "click", args: [{ by: "text", value: "Go" }] }]] },
						VALID_STEPS.steps[2]
					]
				}
			],
			["a Step is not an object", { steps: [null, VALID_STEPS.steps[2]] }],
			["the steps array is missing", {}],
			["the Steps do not end with finish", { steps: [VALID_STEPS.steps[0]] }],
			["the response is not JSON", "not json"]
		])("fails loudly when %s", async (_name, response) => {
			respondWith(VALID_SCHEMA, response, response);
			const { RecipeCompilationInvalidResponseError } = await import("./recipeCompilation");

			await expect(compile()).rejects.toThrow(RecipeCompilationInvalidResponseError);
		});
	});
});
