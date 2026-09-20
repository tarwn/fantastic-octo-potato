import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendChatCompletion } from "./llmClient";

vi.mock("./llmClient", () => ({ sendChatCompletion: vi.fn() }));

const mockedSendChatCompletion = vi.mocked(sendChatCompletion);

beforeEach(() => {
	mockedSendChatCompletion.mockReset();
});

describe("deriveGoalIngredients", () => {
	it("produces a named, typed, sensitivity-flagged Ingredient for an example value embedded in the goal", async () => {
		mockedSendChatCompletion.mockResolvedValue(
			JSON.stringify([{ name: "accountNumber", value: "ACCT-1042", type: "string", sensitive: true }])
		);
		const { deriveGoalIngredients } = await import("./goalIngredients");

		const result = await deriveGoalIngredients("Look up account ACCT-1042 and report its balance");

		expect(result).toEqual([{ name: "accountNumber", value: "ACCT-1042", type: "string", sensitive: true }]);
		expect(mockedSendChatCompletion).toHaveBeenCalledTimes(1);
	});

	it("returns an empty array when the goal names no concrete example values", async () => {
		mockedSendChatCompletion.mockResolvedValue("[]");
		const { deriveGoalIngredients } = await import("./goalIngredients");

		const result = await deriveGoalIngredients("Find the total of all outstanding invoices");

		expect(result).toEqual([]);
	});

	it("retries once on an invalid response and succeeds if the retry is valid", async () => {
		mockedSendChatCompletion
			.mockResolvedValueOnce("not json")
			.mockResolvedValueOnce(JSON.stringify([{ name: "amount", value: "100", type: "number", sensitive: false }]));
		const { deriveGoalIngredients } = await import("./goalIngredients");

		const result = await deriveGoalIngredients("Pay invoice 100");

		expect(result).toEqual([{ name: "amount", value: "100", type: "number", sensitive: false }]);
		expect(mockedSendChatCompletion).toHaveBeenCalledTimes(2);
	});

	it("fails loudly after exhausting retries on a still-invalid response", async () => {
		mockedSendChatCompletion.mockResolvedValue("not json");
		const { deriveGoalIngredients, GoalIngredientsInvalidResponseError } = await import("./goalIngredients");

		await expect(deriveGoalIngredients("Pay invoice 100")).rejects.toThrow(GoalIngredientsInvalidResponseError);
		expect(mockedSendChatCompletion).toHaveBeenCalledTimes(2);
	});

	it("fails loudly when a response Ingredient is missing a required field", async () => {
		mockedSendChatCompletion.mockResolvedValue(JSON.stringify([{ name: "amount", type: "number", sensitive: false }]));
		const { deriveGoalIngredients, GoalIngredientsInvalidResponseError } = await import("./goalIngredients");

		await expect(deriveGoalIngredients("Pay invoice 100")).rejects.toThrow(GoalIngredientsInvalidResponseError);
	});

	it("fails loudly when the response is not a JSON array", async () => {
		mockedSendChatCompletion.mockResolvedValue(JSON.stringify({ name: "amount" }));
		const { deriveGoalIngredients, GoalIngredientsInvalidResponseError } = await import("./goalIngredients");

		await expect(deriveGoalIngredients("Pay invoice 100")).rejects.toThrow(GoalIngredientsInvalidResponseError);
	});
});
