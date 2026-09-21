import { MAX_RECIPE_NAME_LENGTH } from "../../recipeName";
import type { JournalEntry } from "../jobs/transcriptSummary";
import { validateRecipeDefinition } from "../recipe/recipeDefinitionValidation";
import { SensitivityType } from "../storage/db/sensitivityType";

import { RECIPE_SCHEMA_SYSTEM_PROMPT } from "./prompts/recipeCompilationPrompt";
import { RECIPE_IDEAL_STEPS_SYSTEM_PROMPT } from "./prompts/recipeIdealStepsPrompt";
import { RECIPE_NAME_SYSTEM_PROMPT } from "./prompts/recipeNamePrompt";
import { RECIPE_RECOVERIES_SYSTEM_PROMPT } from "./prompts/recipeRecoveriesPrompt";
import { sendChatCompletion } from "./llmClient";
import { requireLlmConfig } from "./llmConfig";

import type { Condition, FieldDeclaration, FieldType, RecipeDefinition, Recovery, Step } from "$lib/types/recipeDefinition";

// Four validated LLM calls in order (schema, Steps, recoveries, name); the finish checkpoint is assembled here.

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
	// What the exploratory run did, with each executed Step nested under its transcript entry.
	journal: JournalEntry[];
	// Sensitivity is already known for an Ingredient (classified at Step 3) — carried straight
	// through to the compiled input's `sensitive` flag rather than re-asked of the LLM.
	ingredients: RecipeCompilationIngredient[];
	// A Result's sensitivity is not yet classified anywhere (jobActions.ts records it as None
	// pending this step) — the LLM classifies it here as part of the output's field declaration.
	results: RecipeCompilationResult[];
	// The Training run's own known-credential set (training_job.credential_names) — the only source
	// of truth for what a `{ref:"credential"}` in a Step may legitimately name, since a
	// credential's value never resolves anywhere but the Runner.
	credentialNames: string[];
}

// Thrown only once a stage has exhausted its attempts with responses that fail validation —
// distinguished from llmClient's config/transport errors so callers can record a compilation
// failure on the Job without flipping its already-Completed-Success status.
export class RecipeCompilationInvalidResponseError extends Error {}

interface CompiledInputSchema {
	type: FieldType;
	description: string;
	enum?: string[];
}

interface CompiledSchema {
	inputs: Record<string, FieldDeclaration>;
	outputs: Record<string, FieldDeclaration>;
}

export interface CompiledRecipe {
	definition: RecipeDefinition;
	name: string;
}

export async function compileRecipe(context: RecipeCompilationContext): Promise<CompiledRecipe> {
	const schema = await runStage("schema", RECIPE_SCHEMA_SYSTEM_PROMPT, buildSchemaUserPrompt(context), (raw) => parseCompiledSchema(raw, context));
	const steps = await runStage("steps", RECIPE_IDEAL_STEPS_SYSTEM_PROMPT, buildStepsUserPrompt(context, schema), (raw) =>
		parseIdealSteps(raw, schema, context)
	);
	const recoveries = await runStage("recoveries", RECIPE_RECOVERIES_SYSTEM_PROMPT, buildRecoveriesUserPrompt(context, schema, steps), (raw) =>
		parseRecoveries(raw, schema, steps, context)
	);
	const name = await runStage("name", RECIPE_NAME_SYSTEM_PROMPT, buildNameUserPrompt(context, schema), parseName);
	return { definition: { schemaVersion: 1, ...schema, steps, recoveries }, name };
}

// Each stage retries on its own so a later stage never re-pays for an earlier one's valid answer.
async function runStage<T>(stage: string, systemPrompt: string, userPrompt: string, parse: (raw: string) => T): Promise<T> {
	const { maxCorrectionAttempts } = requireLlmConfig();
	let lastError: unknown;
	for (let attempt = 1; attempt <= maxCorrectionAttempts; attempt++) {
		const raw = await sendChatCompletion({ systemPrompt, userPrompt });
		try {
			return parse(raw);
		}
		catch (err) {
			lastError = err;
		}
	}
	throw new RecipeCompilationInvalidResponseError(
		`LLM did not return a valid Recipe compilation (${stage}) after ${maxCorrectionAttempts} attempt(s): ${truncate(lastError instanceof Error ? lastError.message : String(lastError))}`
	);
}

// This message is written verbatim into the Job's transcript (reportDslStep.ts) on a compilation
// failure — bounded so a large compiled schema doesn't blow up that row's size.
const MAX_ERROR_MESSAGE_LENGTH = 1000;

function truncate(message: string): string {
	return message.length > MAX_ERROR_MESSAGE_LENGTH ? `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH)}… (truncated)` : message;
}

function buildSchemaUserPrompt(context: RecipeCompilationContext): string {
	return JSON.stringify({
		goal: context.goal,
		transcript: context.transcriptSummary,
		inputs: context.ingredients.map((ingredient) => ({ name: ingredient.fieldName, exampleValue: ingredient.safeValue })),
		outputs: context.results.map((result) => ({ name: result.fieldName, observedValue: result.safeValue }))
	});
}

function buildStepsUserPrompt(context: RecipeCompilationContext, schema: CompiledSchema): string {
	return JSON.stringify({ goal: context.goal, inputs: schema.inputs, outputs: schema.outputs, journal: context.journal });
}

function buildRecoveriesUserPrompt(context: RecipeCompilationContext, schema: CompiledSchema, steps: Step[]): string {
	return JSON.stringify({ goal: context.goal, inputs: schema.inputs, outputs: schema.outputs, steps, journal: context.journal });
}

function buildNameUserPrompt(context: RecipeCompilationContext, schema: CompiledSchema): string {
	return JSON.stringify({ goal: context.goal, inputs: schema.inputs, outputs: schema.outputs });
}

function assembleInputs(compiled: Record<string, CompiledInputSchema>, context: RecipeCompilationContext): Record<string, FieldDeclaration> {
	const inputs: Record<string, FieldDeclaration> = {};
	for (const ingredient of context.ingredients) {
		const declaration = compiled[ingredient.fieldName];
		inputs[ingredient.fieldName] = {
			type: declaration.type,
			description: declaration.description,
			required: true,
			nullable: false,
			sensitive: ingredient.sensitivityType !== SensitivityType.None,
			...(declaration.enum ? { enum: declaration.enum } : {})
		};
	}
	return inputs;
}

// A composite "all"/"assigned" check over every final output (examples.json's pattern) — with
// zero outputs this degenerates to {"test":"all","args":[]}, which validateRecipeDefinition
// accepts as a trivially-satisfied checkpoint.
function buildFinishCheckpoint(outputNames: string[]): Condition {
	return { test: "all", args: outputNames.map((name) => ({ test: "assigned", args: [{ ref: "output", name }] })) };
}

function parseJsonObject(raw: string): Record<string, unknown> {
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
	return parsed as Record<string, unknown>;
}

function parseIdealSteps(raw: string, schema: CompiledSchema, context: RecipeCompilationContext): Step[] {
	const { steps } = parseJsonObject(raw);
	if (!Array.isArray(steps) || steps.length === 0) {
		throw new Error(`LLM response is missing a steps array: ${raw}`);
	}
	requireIntents(steps, raw);
	const last = steps[steps.length - 1] as Step;
	if (last.action !== "finish") {
		throw new Error(`LLM response steps must end with a finish Step: ${raw}`);
	}
	const finalSteps = [...steps.slice(0, -1), { ...last, args: [buildFinishCheckpoint(Object.keys(schema.outputs))] }] as Step[];
	const errors = validateRecipeDefinition({ schemaVersion: 1, ...schema, steps: finalSteps, recoveries: [] }, new Set(context.credentialNames));
	if (errors.length > 0) {
		throw new Error(`Compiled Steps are invalid: ${errors.join("; ")} (raw: ${raw})`);
	}
	return finalSteps;
}

// Operators read a Recipe through each Step's intent, so a compiled Step without one is rejected.
function requireIntents(steps: unknown[], raw: string): void {
	for (const step of steps) {
		if (typeof step !== "object" || step === null) {
			throw new Error(`LLM response contains a Step that is not an object: ${raw}`);
		}
		const { id, intent, action, args } = step as { id?: unknown; intent?: unknown; action?: unknown; args?: unknown[] };
		if (typeof intent !== "string" || intent.trim() === "") {
			throw new Error(`LLM response Step ${String(id)} has no intent: ${raw}`);
		}
		if (action === "group") {
			requireIntents((args?.[0] as unknown[]) ?? [], raw);
		}
		if (action === "if") {
			for (const ifCase of (args?.[0] as { steps?: unknown[] }[]) ?? []) {
				requireIntents(ifCase.steps ?? [], raw);
			}
			requireIntents((args?.[1] as unknown[]) ?? [], raw);
		}
	}
}

function parseRecoveries(raw: string, schema: CompiledSchema, steps: Step[], context: RecipeCompilationContext): Recovery[] {
	const { recoveries } = parseJsonObject(raw);
	if (!Array.isArray(recoveries)) {
		throw new Error(`LLM response is missing a recoveries array: ${raw}`);
	}
	for (const recovery of recoveries) {
		if (typeof recovery !== "object" || recovery === null) {
			throw new Error(`LLM response contains a recovery that is not an object: ${raw}`);
		}
		const { id, description, steps: recoverySteps } = recovery as { id?: unknown; description?: unknown; steps?: unknown };
		if (typeof description !== "string" || description.trim() === "") {
			throw new Error(`LLM response recovery ${String(id)} has no description: ${raw}`);
		}
		if (!Array.isArray(recoverySteps)) {
			throw new Error(`LLM response recovery ${String(id)} has no steps array: ${raw}`);
		}
		requireIntents(recoverySteps, raw);
	}
	const errors = validateRecipeDefinition({ schemaVersion: 1, ...schema, steps, recoveries: recoveries as Recovery[] }, new Set(context.credentialNames));
	if (errors.length > 0) {
		throw new Error(`Compiled recoveries are invalid: ${errors.join("; ")} (raw: ${raw})`);
	}
	return recoveries as Recovery[];
}

function parseName(raw: string): string {
	const { name } = parseJsonObject(raw);
	if (typeof name !== "string" || name.trim() === "") {
		throw new Error(`LLM response is missing a name: ${raw}`);
	}
	const trimmed = name.trim();
	if (trimmed.length > MAX_RECIPE_NAME_LENGTH) {
		throw new Error(`LLM response name is ${trimmed.length} characters, over the ${MAX_RECIPE_NAME_LENGTH} limit: ${raw}`);
	}
	return trimmed;
}

function parseCompiledSchema(raw: string, context: RecipeCompilationContext): CompiledSchema {
	const { inputs, outputs } = parseJsonObject(raw);
	const inputNames = new Set(context.ingredients.map((ingredient) => ingredient.fieldName));
	const observedOutputNames = new Set(context.results.map((result) => result.fieldName));
	return {
		inputs: assembleInputs(validateInputRecord(inputs, inputNames, raw), context),
		outputs: validateOutputSubset(outputs, observedOutputNames, raw)
	};
}

function validateInputRecord(value: unknown, expectedNames: ReadonlySet<string>, raw: string): Record<string, CompiledInputSchema> {
	if (typeof value !== "object" || value === null) {
		throw new Error(`LLM response is missing a field-declaration object: ${raw}`);
	}
	const record = value as Record<string, unknown>;
	const actualNames = new Set(Object.keys(record));
	if (actualNames.size !== expectedNames.size || [...expectedNames].some((name) => !actualNames.has(name))) {
		throw new Error(`LLM response field names ${JSON.stringify([...actualNames])} do not match the observed names ${JSON.stringify([...expectedNames])}: ${raw}`);
	}
	const result: Record<string, CompiledInputSchema> = {};
	for (const name of expectedNames) {
		result[name] = validateInputDeclaration(name, record[name], raw);
	}
	return result;
}

// Call 1 may drop outputs the goal doesn't need but never invent or rename one.
function validateOutputSubset(value: unknown, observedNames: ReadonlySet<string>, raw: string): Record<string, FieldDeclaration> {
	if (typeof value !== "object" || value === null) {
		throw new Error(`LLM response is missing a field-declaration object: ${raw}`);
	}
	const result: Record<string, FieldDeclaration> = {};
	for (const [name, item] of Object.entries(value)) {
		if (!observedNames.has(name)) {
			throw new Error(`LLM response output ${name} was never observed: ${raw}`);
		}
		result[name] = validateOutputDeclaration(name, item, raw);
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
