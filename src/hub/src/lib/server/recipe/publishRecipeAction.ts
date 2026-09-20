import type Database from "better-sqlite3";

import { RecipeStatus } from "../storage/db/recipeStatus";
import { getQualifyingTrialJobIds, getRecipeById, publishRecipe, RecipePublishConflictError } from "../storage/repositories/recipeRepository";

import { toRecipeSummaries } from "./recipeActions";

export interface PublishRecipeActionResult {
	status: number;
	body: { data: unknown } | { error: string };
}

interface PublishRecipeBody {
	name?: unknown;
	replacesRecipeId?: unknown;
}

const MAX_RECIPE_NAME_LENGTH = 100;

export function publishRecipeAction(db: Database.Database, rawRecipeId: string, body: PublishRecipeBody): PublishRecipeActionResult {
	const recipeId = Number(rawRecipeId);
	const recipe = Number.isNaN(recipeId) ? undefined : getRecipeById(db, recipeId);
	if (!recipe) {
		return { status: 404, body: { error: `Recipe ${rawRecipeId} not found` } };
	}

	const name = typeof body.name === "string" ? body.name.trim() : "";
	if (name.length === 0 || name.length > MAX_RECIPE_NAME_LENGTH) {
		return { status: 400, body: { error: `name must be 1-${MAX_RECIPE_NAME_LENGTH} characters` } };
	}
	if (body.replacesRecipeId !== undefined && (typeof body.replacesRecipeId !== "number" || !Number.isInteger(body.replacesRecipeId))) {
		return { status: 400, body: { error: "replacesRecipeId must be an integer" } };
	}

	if (recipe.recipeStatusId !== RecipeStatus.Draft) {
		return { status: 409, body: { error: "Recipe is not a draft" } };
	}
	const qualifyingTrialJobIds = getQualifyingTrialJobIds(db, [recipe.id]);
	if (!qualifyingTrialJobIds.has(recipe.id)) {
		return { status: 400, body: { error: "Recipe has no successful Trial Job" } };
	}

	// The transaction in publishRecipe re-checks this; the pre-check here only gives distinct 400 vs 409 messages.
	if (body.replacesRecipeId !== undefined) {
		const replaced = getRecipeById(db, body.replacesRecipeId);
		if (!replaced || replaced.customerApplicationXrefId !== recipe.customerApplicationXrefId) {
			return { status: 400, body: { error: `Recipe ${body.replacesRecipeId} is not a Recipe of this Registered Application` } };
		}
		if (replaced.recipeStatusId === RecipeStatus.Archived) {
			return { status: 409, body: { error: `Recipe ${replaced.id} is no longer published` } };
		}
		if (replaced.recipeStatusId !== RecipeStatus.Released) {
			return { status: 400, body: { error: `Recipe ${replaced.id} is not published` } };
		}
	}

	try {
		const published = publishRecipe(db, recipe.id, new Date(), { name, replacesRecipeId: body.replacesRecipeId });
		if (!published) {
			return { status: 409, body: { error: "Recipe is not a draft" } };
		}
		return { status: 200, body: { data: toRecipeSummaries([published], qualifyingTrialJobIds)[0] } };
	}
	catch (err) {
		if (err instanceof RecipePublishConflictError) {
			return { status: 409, body: { error: err.message } };
		}
		throw err;
	}
}
