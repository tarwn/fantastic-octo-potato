import { RecipeStatus } from "../storage/db/recipeStatus";
import type { Recipe } from "../storage/repositories/recipeRepository";

export interface RecipeSummary {
	id: number;
	name: string;
	goal: string;
	state: "Draft" | "Published";
	definition: Recipe["definition"];
}

const RECIPE_STATUS_LABELS: Record<RecipeStatus, "Draft" | "Published"> = {
	[RecipeStatus.Draft]: "Draft",
	[RecipeStatus.Released]: "Published"
};

// Pure shaping only — no DB access, so recipe/ stays free of the storage dependency that would
// otherwise form a cycle with storage/repositories/recipeRepository.ts (which itself depends on
// recipe/recipeDefinitionValidation.ts). Callers (the recipes-listing route) fetch the Recipes via
// storage themselves and hand them here just to be shaped into the wire summary.
export function toRecipeSummaries(recipes: Recipe[]): RecipeSummary[] {
	return recipes.map((recipe) => ({
		id: recipe.id,
		name: recipe.name,
		goal: recipe.goal,
		state: RECIPE_STATUS_LABELS[recipe.recipeStatusId],
		definition: recipe.definition
	}));
}
