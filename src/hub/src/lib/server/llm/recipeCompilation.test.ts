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
		executedSteps: [
			{ id: "open_starting_url", action: "open", args: [{ ref: "input", name: "startingUrl" }] },
			{
				id: "read_total",
				action: "read",
				args: [{ by: "text", value: "Total" }, "text", { ref: "output", name: "total" }]
			},
			{ id: "s3", action: "finish", args: [null] }
		],
		ingredients: [{ fieldName: "startingUrl", safeValue: "https://example.com/start", sensitivityType: SensitivityType.None }],
		results: [{ fieldName: "total", safeValue: "100" }],
		credentialNames: [],
		...overrides
	};
}

const VALID_RESPONSE = {
	inputs: { startingUrl: { type: "string", description: "Where to start" } },
	outputs: { total: { type: "number", description: "Invoice total", required: true, nullable: false, sensitive: false } }
};

describe("compileRecipe", () => {
	it("compiles a valid response into a RecipeDefinition that carries the executed Steps over verbatim", async () => {
		mockedSendChatCompletion.mockResolvedValue(JSON.stringify(VALID_RESPONSE));
		const { compileRecipe } = await import("./recipeCompilation");

		const result = await compileRecipe(baseContext());

		expect(result).toEqual({
			schemaVersion: 1,
			inputs: { startingUrl: { type: "string", description: "Where to start", required: true, nullable: false, sensitive: false } },
			outputs: { total: { type: "number", description: "Invoice total", required: true, nullable: false, sensitive: false } },
			steps: [
				{ id: "open_starting_url", action: "open", args: [{ ref: "input", name: "startingUrl" }] },
				{
					id: "read_total",
					action: "read",
					args: [{ by: "text", value: "Total" }, "text", { ref: "output", name: "total" }]
				},
				{ id: "s3", action: "finish", args: [{ test: "all", args: [{ test: "assigned", args: [{ ref: "output", name: "total" }] }] }] }
			],
			recoveries: []
		});
	});

	it("carries an Ingredient's already-known sensitivity through to the compiled input, not the LLM's opinion", async () => {
		mockedSendChatCompletion.mockResolvedValue(JSON.stringify(VALID_RESPONSE));
		const { compileRecipe } = await import("./recipeCompilation");

		const result = await compileRecipe(
			baseContext({ ingredients: [{ fieldName: "startingUrl", safeValue: "••••••", sensitivityType: SensitivityType.PII }] })
		);

		expect(result.inputs.startingUrl.sensitive).toBe(true);
	});

	it("builds a trivially-satisfied checkpoint when the run produced no outputs", async () => {
		mockedSendChatCompletion.mockResolvedValue(
			JSON.stringify({ inputs: VALID_RESPONSE.inputs, outputs: {} })
		);
		const { compileRecipe } = await import("./recipeCompilation");

		const result = await compileRecipe(
			baseContext({
				executedSteps: [{ id: "s1", action: "finish", args: [null] }],
				results: []
			})
		);

		expect(result.steps).toEqual([{ id: "s1", action: "finish", args: [{ test: "all", args: [] }] }]);
	});

	it("retries once when the response is missing an observed field, and succeeds if the retry is valid", async () => {
		mockedSendChatCompletion
			.mockResolvedValueOnce(JSON.stringify({ inputs: {}, outputs: VALID_RESPONSE.outputs }))
			.mockResolvedValueOnce(JSON.stringify(VALID_RESPONSE));
		const { compileRecipe } = await import("./recipeCompilation");

		const result = await compileRecipe(baseContext());

		expect(result.inputs.startingUrl).toBeDefined();
		expect(mockedSendChatCompletion).toHaveBeenCalledTimes(2);
	});

	it("fails loudly after exhausting retries on a still-invalid response, with no Recipe assembled", async () => {
		mockedSendChatCompletion.mockResolvedValue("not json");
		const { compileRecipe, RecipeCompilationInvalidResponseError } = await import("./recipeCompilation");

		await expect(compileRecipe(baseContext())).rejects.toThrow(RecipeCompilationInvalidResponseError);
		expect(mockedSendChatCompletion).toHaveBeenCalledTimes(2);
	});

	it("truncates a long raw LLM response before it lands in the thrown error (and later the transcript)", async () => {
		mockedSendChatCompletion.mockResolvedValue(`not json, and quite long: ${"x".repeat(2000)}`);
		const { compileRecipe, RecipeCompilationInvalidResponseError } = await import("./recipeCompilation");

		const error: unknown = await compileRecipe(baseContext()).catch((err: unknown) => err);

		expect(error).toBeInstanceOf(RecipeCompilationInvalidResponseError);
		expect((error as Error).message).toMatch(/… \(truncated\)$/);
		expect((error as Error).message.length).toBeLessThan(1100);
	});

	it("accepts an executed Step referencing a credential name the Training run reported", async () => {
		mockedSendChatCompletion.mockResolvedValue(JSON.stringify(VALID_RESPONSE));
		const { compileRecipe } = await import("./recipeCompilation");

		const result = await compileRecipe(
			baseContext({
				executedSteps: [
					{ id: "open_starting_url", action: "open", args: [{ ref: "input", name: "startingUrl" }] },
					{ id: "fill_user", action: "fill", args: [{ by: "label", value: "Username" }, { ref: "credential", name: "loginUser" }] },
					{
						id: "read_total",
						action: "read",
						args: [{ by: "text", value: "Total" }, "text", { ref: "output", name: "total" }]
					},
					{ id: "s3", action: "finish", args: [null] }
				],
				credentialNames: ["loginUser"]
			})
		);

		expect(result.steps).toContainEqual({
			id: "fill_user",
			action: "fill",
			args: [{ by: "label", value: "Username" }, { ref: "credential", name: "loginUser" }]
		});
	});

	it("fails loudly when an executed Step references a credential name the Training run never reported", async () => {
		mockedSendChatCompletion.mockResolvedValue(JSON.stringify(VALID_RESPONSE));
		const { compileRecipe, RecipeCompilationInvalidResponseError } = await import("./recipeCompilation");

		await expect(
			compileRecipe(
				baseContext({
					executedSteps: [
						{ id: "fill_user", action: "fill", args: [{ by: "label", value: "Username" }, { ref: "credential", name: "guessed" }] },
						{ id: "s3", action: "finish", args: [null] }
					],
					credentialNames: ["loginUser"]
				})
			)
		).rejects.toThrow(RecipeCompilationInvalidResponseError);
	});

	it("fails loudly when the response invents a field name that was never observed", async () => {
		mockedSendChatCompletion.mockResolvedValue(
			JSON.stringify({
				inputs: VALID_RESPONSE.inputs,
				outputs: { ...VALID_RESPONSE.outputs, extra: { type: "string", description: "x", required: true, nullable: false, sensitive: false } }
			})
		);
		const { compileRecipe, RecipeCompilationInvalidResponseError } = await import("./recipeCompilation");

		await expect(compileRecipe(baseContext())).rejects.toThrow(RecipeCompilationInvalidResponseError);
	});
});
