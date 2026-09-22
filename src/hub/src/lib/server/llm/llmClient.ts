import { requireLlmConfig } from "./llmConfig";

// Minimal OpenAI-scheme chat-completions client, built on plain fetch rather than an SDK to avoid
// an unused-surface dependency. Callers own their own prompts, schema validation, and
// correction-retry loops — this function only makes the HTTP call and returns the model's raw
// text response.

export interface ChatCompletionRequest {
	systemPrompt: string;
	userPrompt: string;
	followUp?: string;
	// Base64-encoded PNG bytes (no data-URL prefix) for a masked screenshot, when the caller has
	// one — sent as an OpenAI-scheme vision content part alongside the text prompt. The caller is
	// responsible for masking (R011); this function never inspects the image.
	userImagePngBase64?: string;
}

function buildUserContent(userPrompt: string, userImagePngBase64: string | undefined): string | Array<Record<string, unknown>> {
	if (userImagePngBase64 === undefined) {
		return userPrompt;
	}
	return [
		{ type: "text", text: userPrompt },
		{ type: "image_url", image_url: { url: `data:image/png;base64,${userImagePngBase64}` } }
	];
}

export async function sendChatCompletion({ systemPrompt, userPrompt, followUp, userImagePngBase64 }: ChatCompletionRequest): Promise<string> {
	const { baseUrl, apiKey, model } = requireLlmConfig();

	const messages = [
		{ role: "system", content: systemPrompt },
		{ role: "user", content: buildUserContent(userPrompt, userImagePngBase64) }
	];
	if(followUp) messages.push({ role: "user", content: followUp });

	console.log("=== LLM Message Sending... ===");
	console.log("System Prompt: \n" + systemPrompt);
	console.log("--");
	console.log("Message: \n" + messages[1].content);
	if(followUp) {
		console.log("--");
		console.log("Followup: \n" + followUp);
	}
	console.log("=====");

	const response = await fetch(`${baseUrl}/chat/completions`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model,
			messages
		})
	});

	if (!response.ok) {
		console.log("LLM Response !ok");
		console.log("=====");
		throw new Error(`LLM request failed with status ${response.status}: ${await response.text()}`);
	}

	const body: unknown = await response.json();
	const content = extractMessageContent(body);
	if (content === undefined) {
		console.log("LLM Response: content undefined");
		console.log("=====");
		throw new Error(`LLM response did not match the expected chat-completion schema: ${JSON.stringify(body)}`);
	}
	console.log("LLM Response:\n" + content);
	console.log("=====");
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
