import { env } from "$env/dynamic/private";

export interface LlmConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
}

function requireEnv(name: string, value: string | undefined): string {
	if (!value) {
		throw new Error(`${name} is not set. Copy src/hub/.env.example to src/hub/.env and set it before starting hub.`);
	}
	return value;
}

export function requireLlmConfig(): LlmConfig {
	return {
		baseUrl: requireEnv("LLM_API_URL", env.LLM_API_URL),
		apiKey: requireEnv("LLM_API_KEY", env.LLM_API_KEY),
		model: requireEnv("LLM_MODEL", env.LLM_MODEL)
	};
}
