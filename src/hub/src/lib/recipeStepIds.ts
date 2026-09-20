import type { RecipeDefinition } from "./types/recipeDefinition";

// Mirrors the Runner's buildLocationIndex: the Steps an Automatic Loop can start from are the
// top-level Steps plus the children of a group or if. Recovery Steps are not resume positions.
export function collectResumableStepIds(recipe: RecipeDefinition): string[] {
	const ids: string[] = [];
	for (const step of recipe.steps) {
		ids.push(step.id);
		if (step.action === "group") {
			ids.push(...step.args[0].map((child) => child.id));
		}
		else if (step.action === "if") {
			const [cases, elseSteps] = step.args;
			ids.push(...cases.flatMap((ifCase) => ifCase.steps.map((child) => child.id)), ...elseSteps.map((child) => child.id));
		}
	}
	return ids;
}
