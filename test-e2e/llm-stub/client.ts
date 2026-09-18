import { DEFAULT_LLM_STUB_PORT } from "./port.mjs";

// Spec-side control for the LLM stub server (server.mjs), started once for the whole e2e run by
// globalSetup.ts. Each test scripts the canned "model" responses it needs before triggering a
// Training Run, then resets the queue in a `finally` so the next test starts clean.

export const LLM_STUB_PORT = process.env.LLM_STUB_PORT ?? String(DEFAULT_LLM_STUB_PORT);
export const LLM_STUB_URL = `http://localhost:${LLM_STUB_PORT}`;

export interface ScriptedLlmResponse {
	content: string;
}

export async function scriptLlmResponses(responses: ScriptedLlmResponse[]): Promise<void> {
	const response = await fetch(`${LLM_STUB_URL}/_script`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(responses)
	});
	if (!response.ok) {
		throw new Error(`llm stub: failed to script responses (${response.status})`);
	}
}

export async function resetLlmStub(): Promise<void> {
	const response = await fetch(`${LLM_STUB_URL}/_reset`, { method: "POST" });
	if (!response.ok) {
		throw new Error(`llm stub: failed to reset (${response.status})`);
	}
}
