import type Database from "better-sqlite3";

import { getRegisteredApplicationById } from "./storage/customerApplicationXrefRepository";
import { appendTranscriptEntry, insertJob, JOB_CREATED_SEQUENCE, upsertJobIngredient } from "./storage/jobRepository";
import { JobStatus } from "./storage/jobStatus";
import { TranscriptKind } from "./storage/jobTranscriptKind";
import { JobType } from "./storage/jobType";
import { getRecipeById, listRecipesForApplication, type Recipe } from "./storage/recipeRepository";
import { RecipeStatus } from "./storage/recipeStatus";
import { SensitivityType } from "./storage/sensitivityType";

import type { FieldDeclaration, RecipeDefinition } from "$lib/types/recipeDefinition";

export interface RecipeActionResult {
	status: number;
	body: { data: unknown } | { error: string };
}

// One default per recipe.md ("The Job supplies one default stepTimeoutMs") — no per-Step override
// exists in the POC DSL, so there is nothing yet for a caller to configure this from.
const RECIPE_JOB_STEP_TIMEOUT_MS = 15_000;

const RECIPE_STATUS_LABELS: Record<RecipeStatus, "Draft" | "Published"> = {
	[RecipeStatus.Draft]: "Draft",
	[RecipeStatus.Released]: "Published"
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function listRecipesAction(db: Database.Database, rawRegisteredApplicationId: string): RecipeActionResult {
	const registeredApplicationId = Number(rawRegisteredApplicationId);
	const registeredApplication = Number.isNaN(registeredApplicationId)
		? undefined
		: getRegisteredApplicationById(db, registeredApplicationId);
	if (!registeredApplication) {
		return { status: 404, body: { error: `Registered Application ${rawRegisteredApplicationId} not found` } };
	}

	const recipes = listRecipesForApplication(db, registeredApplication.id).map((recipe) => ({
		id: recipe.id,
		name: recipe.name,
		goal: recipe.goal,
		state: RECIPE_STATUS_LABELS[recipe.recipeStatusId],
		definition: recipe.definition
	}));

	return { status: 200, body: { data: recipes } };
}

// Only the main (top-level) Step sequence is searched — the seeded/hand-authored Recipes this
// spec targets always open with a literal URL first (C009: no pixel/coordinate authoring UI to
// support anything richer yet).
function deriveAllowlistFromRecipe(definition: RecipeDefinition): string | undefined {
	const openStep = definition.steps.find((step) => step.action === "open" && typeof step.args[0] === "string");
	if (!openStep || openStep.action !== "open" || typeof openStep.args[0] !== "string") {
		return undefined;
	}
	try {
		return new URL(openStep.args[0]).origin;
	}
	catch {
		return undefined;
	}
}

// Validates ingredient values against the Recipe's declared inputs (R006): required/nullable/type/enum,
// plus rejecting any ingredient the Recipe doesn't declare. Mirrors recipeDefinitionValidation.ts's
// "reject before dispatch" spirit, but for a Job's runtime inputs rather than the Recipe's own shape.
function validateIngredients(inputs: Record<string, FieldDeclaration>, ingredients: Record<string, unknown>): string[] {
	const errors: string[] = [];

	for (const [name, declaration] of Object.entries(inputs)) {
		const value = ingredients[name];
		if (value === undefined) {
			if (declaration.required) {
				errors.push(`${name} is required`);
			}
			continue;
		}
		if (value === null) {
			if (!declaration.nullable) {
				errors.push(`${name} cannot be null`);
			}
			continue;
		}
		if (typeof value !== declaration.type) {
			errors.push(`${name} must be a ${declaration.type}`);
			continue;
		}
		if (declaration.enum && !declaration.enum.includes(String(value))) {
			errors.push(`${name} must be one of: ${declaration.enum.join(", ")}`);
		}
	}

	for (const name of Object.keys(ingredients)) {
		if (!(name in inputs)) {
			errors.push(`Unknown ingredient: ${name}`);
		}
	}

	return errors;
}

interface CreateRecipeJobBody {
	mode?: unknown;
	ingredients?: unknown;
}

export function createRecipeJobAction(db: Database.Database, rawRecipeId: string, body: CreateRecipeJobBody): RecipeActionResult {
	const recipeId = Number(rawRecipeId);
	const recipe: Recipe | undefined = Number.isNaN(recipeId) ? undefined : getRecipeById(db, recipeId);
	if (!recipe) {
		return { status: 404, body: { error: `Recipe ${rawRecipeId} not found` } };
	}

	if (body.mode !== "Trial" && body.mode !== "Execute") {
		return { status: 400, body: { error: "mode must be 'Trial' or 'Execute'" } };
	}
	if (body.mode === "Trial" && recipe.recipeStatusId !== RecipeStatus.Draft) {
		return { status: 400, body: { error: "Start Trial requires a draft Recipe" } };
	}
	if (body.mode === "Execute" && recipe.recipeStatusId !== RecipeStatus.Released) {
		return { status: 400, body: { error: "Start Job requires a published Recipe" } };
	}

	const ingredients = isRecord(body.ingredients) ? body.ingredients : {};
	const validationErrors = validateIngredients(recipe.definition.inputs, ingredients);
	if (validationErrors.length > 0) {
		return { status: 400, body: { error: validationErrors.join("; ") } };
	}

	const allowlist = deriveAllowlistFromRecipe(recipe.definition);
	if (!allowlist) {
		return { status: 400, body: { error: "Recipe has no literal starting URL to derive an allowlist from" } };
	}

	const createdAt = new Date();
	const job = insertJob(db, {
		jobType: JobType.Recipe,
		customerApplicationXrefId: recipe.customerApplicationXrefId,
		recipeId: recipe.id,
		mode: body.mode,
		allowlist,
		stepTimeoutMs: RECIPE_JOB_STEP_TIMEOUT_MS,
		createdAt
	});

	for (const [name, declaration] of Object.entries(recipe.definition.inputs)) {
		const value = ingredients[name];
		if (value === undefined) {
			continue;
		}
		// raw_value is NOT NULL — a nullable-and-assigned-null ingredient (recipe.md: "required
		// nullable fields must still be assigned") stores as the empty string sentinel.
		const rawValue = value === null ? "" : String(value);
		upsertJobIngredient(db, job.id, name, rawValue, declaration.sensitive ? SensitivityType.PII : SensitivityType.None, createdAt);
	}

	appendTranscriptEntry(db, job.id, JOB_CREATED_SEQUENCE, TranscriptKind.Status, "Job created, queued for a Runner", createdAt, JobStatus.Pending);

	return { status: 201, body: { data: job } };
}
