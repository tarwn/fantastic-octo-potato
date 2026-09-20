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
		knownStepIds: [],
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

	it("retries when the response reuses an already-used Step id and succeeds on a fresh id", async () => {
		mockedSendChatCompletion
			.mockResolvedValueOnce(JSON.stringify({ id: "open_starting_url", action: "finish", args: [null] }))
			.mockResolvedValueOnce(JSON.stringify({ id: "finish_run", action: "finish", args: [null] }));
		const { deriveNextStep } = await import("./nextStep");

		const result = await deriveNextStep(baseContext({ knownStepIds: ["open_starting_url"] }));

		expect(result).toEqual({ id: "finish_run", action: "finish", args: [null] });
		expect(mockedSendChatCompletion).toHaveBeenCalledTimes(2);
	});

	it("fails loudly when the response reuses an already-used Step id on every attempt", async () => {
		mockedSendChatCompletion.mockResolvedValue(JSON.stringify({ id: "open_starting_url", action: "finish", args: [null] }));
		const { deriveNextStep, NextStepInvalidResponseError } = await import("./nextStep");

		await expect(deriveNextStep(baseContext({ knownStepIds: ["open_starting_url"] }))).rejects.toThrow(NextStepInvalidResponseError);
		expect(mockedSendChatCompletion).toHaveBeenCalledTimes(2);
	});

	it("lists the used Step ids in the prompt and carries the collision error into the retry prompt", async () => {
		mockedSendChatCompletion
			.mockResolvedValueOnce(JSON.stringify({ id: "open_starting_url", action: "finish", args: [null] }))
			.mockResolvedValueOnce(JSON.stringify({ id: "finish_run", action: "finish", args: [null] }));
		const { deriveNextStep } = await import("./nextStep");

		await deriveNextStep(baseContext({ knownStepIds: ["open_starting_url"] }));

		const [[first], [second]] = mockedSendChatCompletion.mock.calls;
		expect(JSON.parse(first.userPrompt).usedStepIds).toEqual(["open_starting_url"]);
		expect(JSON.parse(first.userPrompt).previousAttemptError).toBeUndefined();
		expect(JSON.parse(second.userPrompt).previousAttemptError).toContain("open_starting_url");
	});

	it("fails loudly when the response references an unknown input", async () => {
		mockedSendChatCompletion.mockResolvedValue(
			JSON.stringify({ id: "s1", action: "assign", args: [{ ref: "output", name: "total" }, { ref: "input", name: "missing" }] })
		);
		const { deriveNextStep, NextStepInvalidResponseError } = await import("./nextStep");

		await expect(deriveNextStep(baseContext())).rejects.toThrow(NextStepInvalidResponseError);
	});
});
