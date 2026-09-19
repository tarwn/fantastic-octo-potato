import type Database from "better-sqlite3";

import { RecipeStatus } from "../storage/db/recipeStatus";
import { getRegisteredApplicationById } from "../storage/repositories/customerApplicationXrefRepository";
import { listRecipesForApplication } from "../storage/repositories/recipeRepository";

export interface RecipeActionResult {
	status: number;
	body: { data: unknown } | { error: string };
}

const RECIPE_STATUS_LABELS: Record<RecipeStatus, "Draft" | "Published"> = {
	[RecipeStatus.Draft]: "Draft",
	[RecipeStatus.Released]: "Published"
};

// Takes `db` and calls only storage/recipeRepository's exported functions (never raw SQL) — the
// "recipe may not import from jobs/llm/runner" dependency rule is about not depending on other
// domains, not about being literally DB-free.
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
