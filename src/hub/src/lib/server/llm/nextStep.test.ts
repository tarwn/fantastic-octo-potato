import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendChatCompletion } from "./llmClient";
import type { NextStepContext } from "./nextStep";

vi.mock("./llmClient", () => ({ sendChatCompletion: vi.fn() }));

const mockedSendChatCompletion = vi.mocked(sendChatCompletion);

beforeEach(() => {
	mockedSendChatCompletion.mockReset();
});

function baseContext(overrides: Partial<NextStepContext> = {}): NextStepContext {
	return {
		goal: "Find the invoice total",
		alternateGoals: [],
		transcriptSummary: "",
		maskedScreenshotPngBase64: undefined,
		knownInputNames: [],
		knownOutputNames: [],
		knownCredentialNames: [],
		...overrides
	};
}

describe("deriveNextStep", () => {
	it("passes through a valid next-Step response", async () => {
		mockedSendChatCompletion.mockResolvedValue(
			JSON.stringify({ id: "click_search", action: "click", args: [{ by: "text", value: "Search" }], intent: "Push Search" })
		);
		const { deriveNextStep } = await import("./nextStep");

		const result = await deriveNextStep(baseContext());

		expect(result).toEqual({ id: "click_search", action: "click", args: [{ by: "text", value: "Search" }], intent: "Push Search" });
		expect(mockedSendChatCompletion).toHaveBeenCalledTimes(1);
	});

	it("includes known credential names (never values) in the user prompt", async () => {
		mockedSendChatCompletion.mockResolvedValue(JSON.stringify({ id: "fill_username", action: "fill", args: [{ by: "label", value: "Username" }, { ref: "credential", name: "loginUser" }] }));
		const { deriveNextStep } = await import("./nextStep");

		await deriveNextStep(baseContext({ knownCredentialNames: ["loginUser", "loginPassword"] }));

		const [{ userPrompt }] = mockedSendChatCompletion.mock.calls[0];
		expect(JSON.parse(userPrompt).knownCredentials).toEqual(["loginUser", "loginPassword"]);
	});

	it("sends the masked screenshot to the LLM client when one is provided", async () => {
		mockedSendChatCompletion.mockResolvedValue(JSON.stringify({ id: "s1", action: "finish", args: [null] }));
		const { deriveNextStep } = await import("./nextStep");

		await deriveNextStep(baseContext({ maskedScreenshotPngBase64: "aGVsbG8=" }));

		expect(mockedSendChatCompletion).toHaveBeenCalledWith(expect.objectContaining({ userImagePngBase64: "aGVsbG8=" }));
	});

	it("retries once on an unknown-action response and succeeds if the retry is valid", async () => {
		mockedSendChatCompletion
			.mockResolvedValueOnce(JSON.stringify({ id: "s1", action: "teleport", args: [] }))
			.mockResolvedValueOnce(JSON.stringify({ id: "s1", action: "finish", args: [null] }));
		const { deriveNextStep } = await import("./nextStep");

		const result = await deriveNextStep(baseContext());

		expect(result).toEqual({ id: "s1", action: "finish", args: [null] });
		expect(mockedSendChatCompletion).toHaveBeenCalledTimes(2);
	});

	it("retries once on a group/if response, since Training Steps are atomic-only", async () => {
		mockedSendChatCompletion
			.mockResolvedValueOnce(JSON.stringify({ id: "s1", action: "group", args: [[]] }))
			.mockResolvedValueOnce(JSON.stringify({ id: "s1", action: "finish", args: [null] }));
		const { deriveNextStep } = await import("./nextStep");

		const result = await deriveNextStep(baseContext());

		expect(result).toEqual({ id: "s1", action: "finish", args: [null] });
		expect(mockedSendChatCompletion).toHaveBeenCalledTimes(2);
	});

	it("fails loudly after exhausting retries on a still-invalid response", async () => {
		mockedSendChatCompletion.mockResolvedValue("not json");
		const { deriveNextStep, NextStepInvalidResponseError } = await import("./nextStep");

		await expect(deriveNextStep(baseContext())).rejects.toThrow(NextStepInvalidResponseError);
		expect(mockedSendChatCompletion).toHaveBeenCalledTimes(2);
	});

	it("fails loudly when the response references an unknown input", async () => {
		mockedSendChatCompletion.mockResolvedValue(
			JSON.stringify({ id: "s1", action: "assign", args: [{ ref: "output", name: "total" }, { ref: "input", name: "missing" }] })
		);
		const { deriveNextStep, NextStepInvalidResponseError } = await import("./nextStep");

		await expect(deriveNextStep(baseContext())).rejects.toThrow(NextStepInvalidResponseError);
	});
});
