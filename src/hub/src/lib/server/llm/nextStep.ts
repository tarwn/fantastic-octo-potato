import { validateAtomicStep } from "../recipe/recipeDefinitionValidation";

import { NEXT_STEP_SYSTEM_PROMPT } from "./prompts/nextStepPrompt";
import { sendChatCompletion } from "./llmClient";
import { requireLlmConfig } from "./llmConfig";

import type { ChildStep } from "$lib/types/recipeDefinition";

// Turns {goal, transcript, screenshot} into one atomic next Step (R003) — the Training-time
// counterpart to goalIngredients.ts, sharing its bounded-retry-then-crash shape. See ./prompts
// for the system prompt text and recipeDefinitionValidation.ts's validateAtomicStep for the DSL
// grammar check (atomic-only, C003).

export interface NextStepContext {
	goal: string;
	alternateGoals: string[];
	transcriptSummary: string;
	// Undefined only for the very first Step of a run, before the Runner has opened anything to screenshot.
	maskedScreenshotPngBase64: string | undefined;
	knownInputNames: string[];
	knownOutputNames: string[];
	// Names only, reported by the Runner (never values, never sent by Hub) — lets the model
	// reference {"ref":"credential","name":"..."} for a login field without ever seeing the secret.
	knownCredentialNames: string[];
	// Step ids already used in this run (steps-dsl.md: ids are unique across main steps).
	knownStepIds: string[];
}

// Thrown only once every attempt has produced a response that fails validation — distinguished
// from llmClient's config/transport errors so callers can turn *this* failure into Completed-Error.
export class NextStepInvalidResponseError extends Error {}

export async function deriveNextStep(context: NextStepContext): Promise<ChildStep> {
	const { maxCorrectionAttempts } = requireLlmConfig();
	const knownInputNames = new Set(context.knownInputNames);
	const knownOutputNames = new Set(context.knownOutputNames);
	const knownCredentialNames = new Set(context.knownCredentialNames);
	const knownStepIds = new Set(context.knownStepIds);
	let lastError: unknown;
	for (let attempt = 1; attempt <= maxCorrectionAttempts; attempt++) {
		const raw = await sendChatCompletion({
			systemPrompt: NEXT_STEP_SYSTEM_PROMPT,
			userPrompt: buildUserPrompt(context, lastError),
			userImagePngBase64: context.maskedScreenshotPngBase64
		});
		try {
			return parseNextStep(raw, knownInputNames, knownOutputNames, knownCredentialNames, knownStepIds);
		}
		catch (err) {
			lastError = err;
		}
	}
	throw new NextStepInvalidResponseError(
		`LLM did not return a valid next Step after ${maxCorrectionAttempts} attempt(s): ${lastError instanceof Error ? lastError.message : String(lastError)}`
	);
}

function buildUserPrompt(context: NextStepContext, previousAttemptError: unknown): string {
	return JSON.stringify({
		goal: context.goal,
		alternateGoals: context.alternateGoals,
		transcript: context.transcriptSummary,
		knownInputs: context.knownInputNames,
		knownOutputs: context.knownOutputNames,
		knownCredentials: context.knownCredentialNames,
		usedStepIds: context.knownStepIds,
		previousAttemptError: previousAttemptError instanceof Error ? previousAttemptError.message : undefined
	});
}

function parseNextStep(
	raw: string,
	knownInputNames: Set<string>,
	knownOutputNames: Set<string>,
	knownCredentialNames: Set<string>,
	knownStepIds: Set<string>
): ChildStep {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	}
	catch {
		throw new Error(`LLM response is not valid JSON: ${raw}`);
	}
	const errors = validateAtomicStep(parsed, knownInputNames, knownOutputNames, knownCredentialNames);
	if (errors.length > 0) {
		throw new Error(`LLM response is not a valid atomic Step: ${errors.join("; ")} (raw: ${raw})`);
	}
	const step = parsed as ChildStep;
	if (knownStepIds.has(step.id)) {
		throw new Error(`LLM response reuses an already-used Step id: ${step.id}`);
	}
	return step;
}
