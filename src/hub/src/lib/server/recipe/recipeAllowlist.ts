import type { RecipeDefinition } from "$lib/types/recipeDefinition";

// Only the main (top-level) Step sequence is searched — the seeded/hand-authored Recipes this
// spec targets always open with a literal URL first (C009: no pixel/coordinate authoring UI to
// support anything richer yet).
export function deriveAllowlistFromRecipe(definition: RecipeDefinition): string | undefined {
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
