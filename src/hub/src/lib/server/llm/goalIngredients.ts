import { GOAL_INGREDIENTS_SYSTEM_PROMPT } from "./prompts/goalIngredientsPrompt";
import { sendChatCompletion } from "./llmClient";
import { requireLlmConfig } from "./llmConfig";

// Response validation for turning an operator's goal statement into named, typed,
// sensitivity-flagged Ingredients before a Training Job is persisted. See ./prompts for the
// system prompt text.

export interface GoalIngredient {
	name: string;
	value: string;
	type: "string" | "number" | "boolean";
	sensitive: boolean;
}

// Thrown only once every attempt has produced a response that fails validation — distinguished
// from llmClient's config/transport errors so callers can turn *this* failure into a submit-time
// error response without masking a genuine missing-config crash.
export class GoalIngredientsInvalidResponseError extends Error {}

export async function deriveGoalIngredients(goal: string): Promise<GoalIngredient[]> {
	const { maxCorrectionAttempts } = requireLlmConfig();
	let lastError: unknown;
	for (let attempt = 1; attempt <= maxCorrectionAttempts; attempt++) {
		const raw = await sendChatCompletion({ systemPrompt: GOAL_INGREDIENTS_SYSTEM_PROMPT, userPrompt: goal });
		try {
			return parseGoalIngredients(raw);
		}
		catch (err) {
			lastError = err;
		}
	}
	throw new GoalIngredientsInvalidResponseError(
		`LLM did not return valid Goal Ingredients after ${maxCorrectionAttempts} attempt(s): ${lastError instanceof Error ? lastError.message : String(lastError)}`
	);
}

function parseGoalIngredients(raw: string): GoalIngredient[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	}
	catch {
		throw new Error(`LLM response is not valid JSON: ${raw}`);
	}
	if (!Array.isArray(parsed)) {
		throw new Error(`LLM response is not a JSON array: ${raw}`);
	}
	return parsed.map((item) => validateIngredient(item, raw));
}

function validateIngredient(item: unknown, raw: string): GoalIngredient {
	if (typeof item !== "object" || item === null) {
		throw new Error(`LLM response contains a non-object Ingredient: ${raw}`);
	}
	const { name, value, type, sensitive } = item as Record<string, unknown>;
	if (typeof name !== "string" || name.trim() === "") {
		throw new Error(`LLM response Ingredient is missing a valid name: ${raw}`);
	}
	if (typeof value !== "string") {
		throw new Error(`LLM response Ingredient ${name} is missing a string value: ${raw}`);
	}
	if (type !== "string" && type !== "number" && type !== "boolean") {
		throw new Error(`LLM response Ingredient ${name} has an invalid type: ${raw}`);
	}
	if (typeof sensitive !== "boolean") {
		throw new Error(`LLM response Ingredient ${name} is missing a boolean sensitive flag: ${raw}`);
	}
	return { name, value, type, sensitive };
}
