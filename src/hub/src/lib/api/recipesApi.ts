import { type JobResponse, parseJob } from "./jobsApi";

import type { Job } from "$lib/types/job";
import type { RecipeDefinition } from "$lib/types/recipeDefinition";

export interface RecipeSummary {
	id: number;
	name: string;
	goal: string;
	state: "Draft" | "Published" | "Archived";
	definition: RecipeDefinition;
	sourceTrainingRunId: string | null;
	qualifiedByJobId: number | null;
	replacesRecipeId: number | null;
}

export async function fetchRecipes(registeredApplicationId: number): Promise<RecipeSummary[]> {
	const response = await fetch(`/api/hub/registered-applications/${registeredApplicationId}/recipes`);
	const body = (await response.json()) as { data: RecipeSummary[] } | { error: string };
	if ("error" in body) {
		throw new Error(body.error);
	}
	return body.data;
}

export interface StartRecipeJobRequested {
	mode: "Trial" | "Execute";
	ingredients: Record<string, string | number | boolean | null>;
}

export async function startRecipeJob(recipeId: number, request: StartRecipeJobRequested): Promise<Job> {
	const response = await fetch(`/api/hub/jobs/new/recipes/${recipeId}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(request)
	});
	const body = (await response.json()) as { data: JobResponse } | { error: string };
	if ("error" in body) {
		throw new Error(body.error);
	}
	return parseJob(body.data);
}

export interface PublishRecipeRequested {
	name: string;
	replacesRecipeId?: number;
}

export async function publishRecipe(recipeId: number, request: PublishRecipeRequested): Promise<RecipeSummary> {
	const response = await fetch(`/api/hub/recipes/${recipeId}/publish`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(request)
	});
	const body = (await response.json()) as { data: RecipeSummary } | { error: string };
	if ("error" in body) {
		throw new Error(body.error);
	}
	return body.data;
}
