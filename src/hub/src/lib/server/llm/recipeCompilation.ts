import { validateRecipeDefinition } from "../recipe/recipeDefinitionValidation";
import { SensitivityType } from "../storage/db/sensitivityType";

import { RECIPE_COMPILATION_SYSTEM_PROMPT } from "./prompts/recipeCompilationPrompt";
import { sendChatCompletion } from "./llmClient";
import { requireLlmConfig } from "./llmConfig";

import type { ChildStep, Condition, FieldDeclaration, FieldType, RecipeDefinition, Step } from "$lib/types/recipeDefinition";

// Turns a completed Training Run's observed transcript into a full RecipeDefinition (R006) — the
// Step 3/4-style bounded-retry-then-crash shape, but only the *schema* half (input/output field
// declarations) is LLM-derived; the executed Step sequence and the finish checkpoint are carried
// over/assembled deterministically here, so compilation can never invent an untested branch.

export interface RecipeCompilationIngredient {
	fieldName: string;
	safeValue: string;
	sensitivityType: SensitivityType;
}

export interface RecipeCompilationResult {
	fieldName: string;
	safeValue: string;
}

export interface RecipeCompilationContext {
	goal: string;
	transcriptSummary: string;
	// The Steps this run actually executed, in order (including its terminal finish Step) —
	// reused verbatim as the compiled Recipe's main Steps (R006: no synthesized alternate endings).
	executedSteps: ChildStep[];
	// Sensitivity is already known for an Ingredient (classified at Step 3) — carried straight
	// through to the compiled input's `sensitive` flag rather than re-asked of the LLM.
	ingredients: RecipeCompilationIngredient[];
	// A Result's sensitivity is not yet classified anywhere (jobActions.ts records it as None
	// pending this step) — the LLM classifies it here as part of the output's field declaration.
	results: RecipeCompilationResult[];
	// The Training run's own known-credential set (training_job.credential_names) — the only source
	// of truth for what a `{ref:"credential"}` in an executedStep may legitimately name, since a
	// credential's value never resolves anywhere but the Runner.
	credentialNames: string[];
}

// Thrown only once every attempt has produced a response that fails validation (either its own
// schema shape or, once assembled into a full RecipeDefinition, validateRecipeDefinition) —
// distinguished from llmClient's config/transport errors so callers can record a compilation
// failure on the Job without flipping its already-Completed-Success status (R007).
export class RecipeCompilationInvalidResponseError extends Error {}

interface CompiledInputSchema {
	type: FieldType;
	description: string;
	enum?: string[];
}

interface CompiledSchema {
	inputs: Record<string, CompiledInputSchema>;
	outputs: Record<string, FieldDeclaration>;
}

export async function compileRecipe(context: RecipeCompilationContext): Promise<RecipeDefinition> {
	const { maxCorrectionAttempts } = requireLlmConfig();
	requireIntents(context.executedSteps);
	let lastError: unknown;
	for (let attempt = 1; attempt <= maxCorrectionAttempts; attempt++) {
		const raw = await sendChatCompletion({ systemPrompt: RECIPE_COMPILATION_SYSTEM_PROMPT, userPrompt: buildUserPrompt(context) });
		try {
			const schema = parseCompiledSchema(raw, context);
			const definition = assembleDefinition(schema, context);
			const errors = validateRecipeDefinition(definition, new Set(context.credentialNames));
			if (errors.length > 0) {
				throw new Error(`Compiled Recipe definition is invalid: ${errors.join("; ")} (raw: ${raw})`);
			}
			return definition;
		}
		catch (err) {
			lastError = err;
		}
	}
	throw new RecipeCompilationInvalidResponseError(
		`LLM did not return a valid Recipe compilation after ${maxCorrectionAttempts} attempt(s): ${truncate(lastError instanceof Error ? lastError.message : String(lastError))}`
	);
}

// This message is written verbatim into the Job's transcript (reportDslStep.ts) on a compilation
// failure — bounded so a large compiled schema doesn't blow up that row's size.
const MAX_ERROR_MESSAGE_LENGTH = 1000;

function truncate(message: string): string {
	return message.length > MAX_ERROR_MESSAGE_LENGTH ? `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH)}… (truncated)` : message;
}

function buildUserPrompt(context: RecipeCompilationContext): string {
	return JSON.stringify({
		goal: context.goal,
		transcript: context.transcriptSummary,
		executedSteps: context.executedSteps,
		inputs: context.ingredients.map((ingredient) => ({ name: ingredient.fieldName, exampleValue: ingredient.safeValue })),
		outputs: context.results.map((result) => ({ name: result.fieldName, observedValue: result.safeValue }))
	});
}

// Operators read a Recipe through each Step's intent (transcript detail), so a compiled draft
// must not carry Steps the Training run never described.
function requireIntents(steps: ChildStep[]): void {
	for (const step of steps) {
		if (!step.intent) {
			throw new RecipeCompilationInvalidResponseError(`Executed Step ${step.id} has no intent`);
		}
	}
}

function assembleDefinition(schema: CompiledSchema, context: RecipeCompilationContext): RecipeDefinition {
	const inputs: Record<string, FieldDeclaration> = {};
	for (const ingredient of context.ingredients) {
		const compiled = schema.inputs[ingredient.fieldName];
		inputs[ingredient.fieldName] = {
			type: compiled.type,
			description: compiled.description,
			required: true,
			nullable: false,
			sensitive: ingredient.sensitivityType !== SensitivityType.None,
			...(compiled.enum ? { enum: compiled.enum } : {})
		};
	}

	const outputNames = context.results.map((result) => result.fieldName);
	const steps: Step[] = context.executedSteps.map((step): Step =>
		step.action === "finish" ? { ...step, args: [buildFinishCheckpoint(outputNames)] as [Condition] } : step
	);

	return {
		schemaVersion: 1,
		inputs,
		outputs: schema.outputs,
		steps,
		// Training's discovery loop has no recovery mechanism of its own to observe (C005,
		// ARCHITECTURE.md FUTURE) — a compiled Recipe never carries a recovery this run never triggered.
		recoveries: []
	};
}

// A composite "all"/"assigned" check over every observed output (examples.json's pattern) — with
// zero outputs this degenerates to {"test":"all","args":[]}, which validateRecipeDefinition
// accepts as a trivially-satisfied checkpoint.
function buildFinishCheckpoint(outputNames: string[]): Condition {
	return { test: "all", args: outputNames.map((name) => ({ test: "assigned", args: [{ ref: "output", name }] })) };
}

function parseCompiledSchema(raw: string, context: RecipeCompilationContext): CompiledSchema {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	}
	catch {
		throw new Error(`LLM response is not valid JSON: ${raw}`);
	}
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error(`LLM response is not a JSON object: ${raw}`);
	}
	const { inputs, outputs } = parsed as Record<string, unknown>;
	const inputNames = new Set(context.ingredients.map((ingredient) => ingredient.fieldName));
	const outputNames = new Set(context.results.map((result) => result.fieldName));
	return {
		inputs: validateFieldRecord(inputs, inputNames, raw, validateInputDeclaration),
		outputs: validateFieldRecord(outputs, outputNames, raw, validateOutputDeclaration)
	};
}

function validateFieldRecord<T>(
	value: unknown,
	expectedNames: ReadonlySet<string>,
	raw: string,
	validateOne: (name: string, item: unknown, raw: string) => T
): Record<string, T> {
	if (typeof value !== "object" || value === null) {
		throw new Error(`LLM response is missing a field-declaration object: ${raw}`);
	}
	const record = value as Record<string, unknown>;
	const actualNames = new Set(Object.keys(record));
	if (actualNames.size !== expectedNames.size || [...expectedNames].some((name) => !actualNames.has(name))) {
		throw new Error(`LLM response field names ${JSON.stringify([...actualNames])} do not match the observed names ${JSON.stringify([...expectedNames])}: ${raw}`);
	}
	const result: Record<string, T> = {};
	for (const name of expectedNames) {
		result[name] = validateOne(name, record[name], raw);
	}
	return result;
}

function validateFieldType(name: string, type: unknown, raw: string): FieldType {
	if (type !== "string" && type !== "number" && type !== "boolean") {
		throw new Error(`LLM response field ${name} has an invalid type: ${raw}`);
	}
	return type;
}

function validateEnum(name: string, value: unknown, raw: string): string[] | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
		throw new Error(`LLM response field ${name} has an invalid enum: ${raw}`);
	}
	return value;
}

function validateInputDeclaration(name: string, item: unknown, raw: string): CompiledInputSchema {
	if (typeof item !== "object" || item === null) {
		throw new Error(`LLM response input ${name} is not an object: ${raw}`);
	}
	const { type, description, enum: enumValues } = item as Record<string, unknown>;
	if (typeof description !== "string" || description.trim() === "") {
		throw new Error(`LLM response input ${name} is missing a description: ${raw}`);
	}
	const enumResult = validateEnum(name, enumValues, raw);
	return { type: validateFieldType(name, type, raw), description, ...(enumResult ? { enum: enumResult } : {}) };
}

function validateOutputDeclaration(name: string, item: unknown, raw: string): FieldDeclaration {
	if (typeof item !== "object" || item === null) {
		throw new Error(`LLM response output ${name} is not an object: ${raw}`);
	}
	const { type, description, required, nullable, sensitive, enum: enumValues } = item as Record<string, unknown>;
	if (typeof description !== "string" || description.trim() === "") {
		throw new Error(`LLM response output ${name} is missing a description: ${raw}`);
	}
	if (typeof required !== "boolean" || typeof nullable !== "boolean" || typeof sensitive !== "boolean") {
		throw new Error(`LLM response output ${name} is missing a required/nullable/sensitive boolean: ${raw}`);
	}
	const enumResult = validateEnum(name, enumValues, raw);
	return { type: validateFieldType(name, type, raw), description, required, nullable, sensitive, ...(enumResult ? { enum: enumResult } : {}) };
}
