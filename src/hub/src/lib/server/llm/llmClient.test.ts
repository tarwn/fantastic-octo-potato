import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv: {
	LLM_API_URL?: string;
	LLM_API_KEY?: string;
	LLM_MODEL?: string;
} = {};

vi.mock("$env/dynamic/private", () => ({ env: mockEnv }));

// In-process fake standing in for the OpenAI-scheme chat-completions endpoint, so this unit test
// stays self-contained within hub's test scope instead of depending on an external server.
function startFakeLlmServer(
	handler: (body: unknown, authorization: string | undefined) => { status: number; body: unknown }
) {
	const server = createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => chunks.push(chunk));
		req.on("end", () => {
			const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf-8")) : undefined;
			const { status, body: responseBody } = handler(body, req.headers.authorization);
			res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(responseBody));
		});
	});
	return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address() as AddressInfo;
			resolve({
				url: `http://127.0.0.1:${port}`,
				close: () => new Promise<void>((res) => server.close(() => res()))
			});
		});
	});
}

let stopServer: (() => Promise<void>) | undefined;

beforeEach(() => {
	delete mockEnv.LLM_API_URL;
	delete mockEnv.LLM_API_KEY;
	delete mockEnv.LLM_MODEL;
	vi.resetModules();
});

afterEach(async () => {
	await stopServer?.();
	stopServer = undefined;
});

describe("sendChatCompletion", () => {
	it("returns the assistant message content on success", async () => {
		const server = await startFakeLlmServer(() => ({
			status: 200,
			body: { choices: [{ message: { role: "assistant", content: "the response" } }] }
		}));
		stopServer = server.close;
		mockEnv.LLM_API_URL = server.url;
		mockEnv.LLM_API_KEY = "key";
		mockEnv.LLM_MODEL = "model";
		const { sendChatCompletion } = await import("./llmClient");

		const result = await sendChatCompletion({ systemPrompt: "system", userPrompt: "user" });

		expect(result).toBe("the response");
	});

	it("sends the model, system, and user messages to the configured endpoint", async () => {
		let receivedBody: unknown;
		let receivedAuth: string | undefined;
		const server = await startFakeLlmServer((body, authorization) => {
			receivedBody = body;
			receivedAuth = authorization;
			return { status: 200, body: { choices: [{ message: { role: "assistant", content: "ok" } }] } };
		});
		stopServer = server.close;
		mockEnv.LLM_API_URL = server.url;
		mockEnv.LLM_API_KEY = "the-key";
		mockEnv.LLM_MODEL = "the-model";
		const { sendChatCompletion } = await import("./llmClient");

		await sendChatCompletion({ systemPrompt: "system prompt", userPrompt: "user prompt" });

		expect(receivedBody).toEqual({
			model: "the-model",
			messages: [
				{ role: "system", content: "system prompt" },
				{ role: "user", content: "user prompt" }
			]
		});
		expect(receivedAuth).toBe("Bearer the-key");
	});

	it("sends the user prompt as a vision content array when an image is provided", async () => {
		let receivedBody: unknown;
		const server = await startFakeLlmServer((body) => {
			receivedBody = body;
			return { status: 200, body: { choices: [{ message: { role: "assistant", content: "ok" } }] } };
		});
		stopServer = server.close;
		mockEnv.LLM_API_URL = server.url;
		mockEnv.LLM_API_KEY = "the-key";
		mockEnv.LLM_MODEL = "the-model";
		const { sendChatCompletion } = await import("./llmClient");

		await sendChatCompletion({ systemPrompt: "system prompt", userPrompt: "user prompt", userImagePngBase64: "aGVsbG8=" });

		expect(receivedBody).toEqual({
			model: "the-model",
			messages: [
				{ role: "system", content: "system prompt" },
				{
					role: "user",
					content: [
						{ type: "text", text: "user prompt" },
						{ type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } }
					]
				}
			]
		});
	});

	it("throws when the response body is malformed JSON", async () => {
		const server = createServer((req, res) => {
			res.writeHead(200, { "content-type": "application/json" }).end("not json");
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const { port } = server.address() as AddressInfo;
		stopServer = () => new Promise<void>((res) => server.close(() => res()));
		mockEnv.LLM_API_URL = `http://127.0.0.1:${port}`;
		mockEnv.LLM_API_KEY = "key";
		mockEnv.LLM_MODEL = "model";
		const { sendChatCompletion } = await import("./llmClient");

		await expect(sendChatCompletion({ systemPrompt: "system", userPrompt: "user" })).rejects.toThrow();
	});

	it("throws when the response does not match the expected chat-completion schema", async () => {
		const server = await startFakeLlmServer(() => ({ status: 200, body: { unexpected: "shape" } }));
		stopServer = server.close;
		mockEnv.LLM_API_URL = server.url;
		mockEnv.LLM_API_KEY = "key";
		mockEnv.LLM_MODEL = "model";
		const { sendChatCompletion } = await import("./llmClient");

		await expect(sendChatCompletion({ systemPrompt: "system", userPrompt: "user" })).rejects.toThrow(
			/did not match the expected chat-completion schema/
		);
	});

	it("throws when the endpoint returns a non-2xx status", async () => {
		const server = await startFakeLlmServer(() => ({ status: 500, body: { error: { message: "boom" } } }));
		stopServer = server.close;
		mockEnv.LLM_API_URL = server.url;
		mockEnv.LLM_API_KEY = "key";
		mockEnv.LLM_MODEL = "model";
		const { sendChatCompletion } = await import("./llmClient");

		await expect(sendChatCompletion({ systemPrompt: "system", userPrompt: "user" })).rejects.toThrow(/status 500/);
	});

	it("crashes loudly when the LLM config is missing", async () => {
		const { sendChatCompletion } = await import("./llmClient");

		await expect(sendChatCompletion({ systemPrompt: "system", userPrompt: "user" })).rejects.toThrow(
			/LLM_API_URL is not set/
		);
	});
});
