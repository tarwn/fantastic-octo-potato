import type Database from "better-sqlite3";

import { deriveAllowlistFromRecipe } from "../../recipe/recipeAllowlist";
import { validateIngredients } from "../../recipe/recipeInputValidation";
import { JobStatus } from "../../storage/db/jobStatus";
import { TranscriptKind } from "../../storage/db/jobTranscriptKind";
import { JobType } from "../../storage/db/jobType";
import { RecipeStatus } from "../../storage/db/recipeStatus";
import { SensitivityType } from "../../storage/db/sensitivityType";
import { appendTranscriptEntry, insertJob, JOB_CREATED_SEQUENCE, upsertJobIngredient } from "../../storage/repositories/jobRepository";
import { getRecipeById, type Recipe } from "../../storage/repositories/recipeRepository";

export interface RecipeJobActionResult {
	status: number;
	body: { data: unknown } | { error: string };
}

// One default per recipe.md ("The Job supplies one default stepTimeoutMs") — no per-Step override
// exists in the POC DSL, so there is nothing yet for a caller to configure this from.
const RECIPE_JOB_STEP_TIMEOUT_MS = 15_000;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

interface CreateRecipeJobBody {
	mode?: unknown;
	ingredients?: unknown;
}

export function createRecipeJob(db: Database.Database, rawRecipeId: string, body: CreateRecipeJobBody): RecipeJobActionResult {
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
