import { env } from "$env/dynamic/private";

export interface LlmConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
	// Bounded correction-retry count shared by every LLM caller that validates a structured
	// response and re-prompts on failure (goal Ingredients, next-Step, Recipe compilation).
	maxCorrectionAttempts: number;
}

const DEFAULT_MAX_CORRECTION_ATTEMPTS = 2;

function requireEnv(name: string, value: string | undefined): string {
	if (!value) {
		throw new Error(`${name} is not set. Copy src/hub/.env.example to src/hub/.env and set it before starting hub.`);
	}
	return value;
}

function readMaxCorrectionAttempts(value: string | undefined): number {
	if (value === undefined) {
		return DEFAULT_MAX_CORRECTION_ATTEMPTS;
	}
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1) {
		throw new Error("LLM_MAX_CORRECTION_ATTEMPTS must be a positive integer.");
	}
	return parsed;
}

export function requireLlmConfig(): LlmConfig {
	return {
		baseUrl: requireEnv("LLM_API_URL", env.LLM_API_URL),
		apiKey: requireEnv("LLM_API_KEY", env.LLM_API_KEY),
		model: requireEnv("LLM_MODEL", env.LLM_MODEL),
		maxCorrectionAttempts: readMaxCorrectionAttempts(env.LLM_MAX_CORRECTION_ATTEMPTS)
	};
}
