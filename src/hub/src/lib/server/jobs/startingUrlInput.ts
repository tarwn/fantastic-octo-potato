import type { ChildStep } from "$lib/types/recipeDefinition";

// Shared between jobs/trainingRunJobs (stores the Job's startingUrl as this Ingredient at
// creation) and runner/ (the fixed first Step's `open` action references it by this name) — one
// name, defined once, rather than a string literal duplicated across both call sites.
export const STARTING_URL_INGREDIENT_NAME = "startingUrl";

export const OPEN_STARTING_URL_STEP_ID = "open_starting_url";

// A Training Run Job's first Step is fixed and Hub-authored, not LLM-generated (steps-dsl.md/C004)
// — persisted at Job creation (jobs/trainingRunJobs) so the Runner's claim just reads it back
// rather than deriving it, same as every later Step (see insertTrainingRunJobStep).
export function buildOpenStartingUrlStep(): ChildStep {
	return { id: OPEN_STARTING_URL_STEP_ID, action: "open", args: [{ ref: "input", name: STARTING_URL_INGREDIENT_NAME }], intent: "Open the starting URL" };
}
