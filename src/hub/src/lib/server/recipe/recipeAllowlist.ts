import type { RecipeDefinition, StringValue } from "$lib/types/recipeDefinition";

// Only the main (top-level) Step sequence is searched — every Recipe this spec targets (hand-
// authored or compiled from a Training run) always opens with a literal URL or an `input` ref
// first (C009: no pixel/coordinate authoring UI to support anything richer yet).
//
// A Recipe compiled from a Training run (createTrainingRunJob.ts/recipeCompilation.ts) carries its
// first Step as `open` referencing the `startingUrl` input, not a literal string — the Training
// run's origin (e.g. a test system) is never baked in. `ingredients` is this Job's submitted
// ingredient values (createRecipeJob.ts, already `validateIngredients`-checked), so a Trial/Execute
// run can re-point that same Recipe at a different origin by supplying a different `startingUrl`.
export function deriveAllowlistFromRecipe(definition: RecipeDefinition, ingredients: Record<string, unknown>): string | undefined {
	const openStep = definition.steps.find((step) => step.action === "open");
	if (!openStep || openStep.action !== "open") {
		return undefined;
	}
	const url = resolveOpenStepUrl(openStep.args[0], ingredients);
	if (url === undefined) {
		return undefined;
	}
	try {
		return new URL(url).origin;
	}
	catch {
		return undefined;
	}
}

function resolveOpenStepUrl(target: StringValue, ingredients: Record<string, unknown>): string | undefined {
	if (typeof target === "string") {
		return target;
	}
	if (target.ref !== "input") {
		return undefined;
	}
	const value = ingredients[target.name];
	return value === undefined ? undefined : String(value);
}
