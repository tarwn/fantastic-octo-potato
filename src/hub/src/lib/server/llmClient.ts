import { requireLlmConfig } from "./llmConfig";

// Minimal OpenAI-scheme chat-completions client, built on plain fetch rather than an SDK to avoid
// an unused-surface dependency. Callers own their own prompts, schema validation, and
// correction-retry loops — this function only makes the HTTP call and returns the model's raw
// text response.

export interface ChatCompletionRequest {
	systemPrompt: string;
	userPrompt: string;
}

export async function sendChatCompletion({ systemPrompt, userPrompt }: ChatCompletionRequest): Promise<string> {
	const { baseUrl, apiKey, model } = requireLlmConfig();

	const response = await fetch(`${baseUrl}/chat/completions`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model,
			messages: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: userPrompt }
			]
		})
	});

	if (!response.ok) {
		throw new Error(`LLM request failed with status ${response.status}: ${await response.text()}`);
	}

	const body: unknown = await response.json();
	const content = extractMessageContent(body);
	if (content === undefined) {
		throw new Error(`LLM response did not match the expected chat-completion schema: ${JSON.stringify(body)}`);
	}
	return content;
}

function extractMessageContent(body: unknown): string | undefined {
	if (typeof body !== "object" || body === null) {
		return undefined;
	}
	const choices = (body as { choices?: unknown }).choices;
	if (!Array.isArray(choices) || choices.length === 0) {
		return undefined;
	}
	const message = (choices[0] as { message?: unknown }).message;
	if (typeof message !== "object" || message === null) {
		return undefined;
	}
	const content = (message as { content?: unknown }).content;
	return typeof content === "string" ? content : undefined;
}
