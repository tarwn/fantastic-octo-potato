import { RecipeStatus } from "../storage/db/recipeStatus";
import type { Recipe } from "../storage/repositories/recipeRepository";

export interface RecipeSummary {
	id: number;
	name: string;
	goal: string;
	state: "Draft" | "Published" | "Archived";
	definition: Recipe["definition"];
	sourceTrainingRunId: string | null;
	qualifiedByJobId: number | null;
	replacesRecipeId: number | null;
}

const RECIPE_STATUS_LABELS: Record<RecipeStatus, RecipeSummary["state"]> = {
	[RecipeStatus.Draft]: "Draft",
	[RecipeStatus.Released]: "Published",
	[RecipeStatus.Archived]: "Archived"
};

// Pure shaping only — no DB access, so recipe/ stays free of the storage dependency that would
// otherwise form a cycle with storage/repositories/recipeRepository.ts (which itself depends on
// recipe/recipeDefinitionValidation.ts). Callers (the recipes routes) fetch the Recipes and their
// qualifying Trial Jobs via storage themselves and hand them here just to be shaped into the wire summary.
export function toRecipeSummaries(recipes: Recipe[], qualifyingTrialJobIds: Map<number, number>): RecipeSummary[] {
	return recipes.map((recipe) => ({
		id: recipe.id,
		name: recipe.name,
		goal: recipe.goal,
		state: RECIPE_STATUS_LABELS[recipe.recipeStatusId],
		definition: recipe.definition,
		sourceTrainingRunId: recipe.sourceTrainingRunId,
		qualifiedByJobId: qualifyingTrialJobIds.get(recipe.id) ?? null,
		replacesRecipeId: recipe.replacesRecipeId
	}));
}
