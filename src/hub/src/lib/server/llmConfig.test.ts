import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv: {
	LLM_API_URL?: string;
	LLM_API_KEY?: string;
	LLM_MODEL?: string;
} = {};

vi.mock("$env/dynamic/private", () => ({ env: mockEnv }));

beforeEach(() => {
	delete mockEnv.LLM_API_URL;
	delete mockEnv.LLM_API_KEY;
	delete mockEnv.LLM_MODEL;
	vi.resetModules();
});

describe("requireLlmConfig", () => {
	it("throws when LLM_API_URL is unset", async () => {
		mockEnv.LLM_API_KEY = "key";
		mockEnv.LLM_MODEL = "model";
		const { requireLlmConfig } = await import("./llmConfig");

		expect(() => requireLlmConfig()).toThrow(/LLM_API_URL is not set/);
	});

	it("throws when LLM_API_KEY is unset", async () => {
		mockEnv.LLM_API_URL = "https://example.test/v1";
		mockEnv.LLM_MODEL = "model";
		const { requireLlmConfig } = await import("./llmConfig");

		expect(() => requireLlmConfig()).toThrow(/LLM_API_KEY is not set/);
	});

	it("throws when LLM_MODEL is unset", async () => {
		mockEnv.LLM_API_URL = "https://example.test/v1";
		mockEnv.LLM_API_KEY = "key";
		const { requireLlmConfig } = await import("./llmConfig");

		expect(() => requireLlmConfig()).toThrow(/LLM_MODEL is not set/);
	});

	it("returns the configured values", async () => {
		mockEnv.LLM_API_URL = "https://example.test/v1";
		mockEnv.LLM_API_KEY = "key";
		mockEnv.LLM_MODEL = "model";
		const { requireLlmConfig } = await import("./llmConfig");

		expect(requireLlmConfig()).toEqual({
			baseUrl: "https://example.test/v1",
			apiKey: "key",
			model: "model"
		});
	});
});
