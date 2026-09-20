import type Database from "better-sqlite3";

import { JobType } from "../storage/db/jobType";
import { type Job, listTrainingRunJobSteps } from "../storage/repositories/jobRepository";
import { getRecipeById } from "../storage/repositories/recipeRepository";

import type { RecipeDefinition, Step } from "$lib/types/recipeDefinition";

function collectRecipeStepActions(definition: RecipeDefinition): Map<string, string> {
	const actions = new Map<string, string>();
	const add = (step: Step): void => {
		actions.set(step.id, step.action);
	};
	for (const step of definition.steps) {
		add(step);
		if (step.action === "group") {
			step.args[0].forEach(add);
		}
		else if (step.action === "if") {
			const [cases, elseSteps] = step.args;
			cases.forEach((ifCase) => ifCase.steps.forEach(add));
			elseSteps.forEach(add);
		}
	}
	definition.recoveries.forEach((recovery) => recovery.steps.forEach(add));
	return actions;
}

// Transcript rows only store the Step id the Runner reported; the Step's action lives on its
// definition (Training: training_job_step, Recipe: the Recipe's Steps incl. children/recoveries).
// An id that resolves to no Step is a data-integrity bug, so it crashes rather than falling back.
export function createStepActionResolver(db: Database.Database, job: Job): (stepId: string) => string {
	const actions =
		job.jobType === JobType.TrainingRun
			? new Map(listTrainingRunJobSteps(db, job.id).map((step) => [step.stepId, step.definition.action]))
			: collectRecipeStepActions(requireRecipeDefinition(db, job));

	return (stepId) => {
		const action = actions.get(stepId);
		if (action === undefined) {
			throw new Error(`Job ${job.id} reported Step "${stepId}", which has no Step definition`);
		}
		return action;
	};
}

export function requireRecipeDefinition(db: Database.Database, job: Extract<Job, { jobType: JobType.Recipe }>): RecipeDefinition {
	if (job.details.recipeId === null) {
		throw new Error(`Job ${job.id} is a Recipe Job with no recipe_id set`);
	}
	const recipe = getRecipeById(db, job.details.recipeId);
	if (!recipe) {
		throw new Error(`Job ${job.id} references Recipe ${job.details.recipeId}, which no longer exists`);
	}
	return recipe.definition;
}
