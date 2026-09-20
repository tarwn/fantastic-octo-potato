import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { toRecipeSummaries } from "$lib/server/recipe/recipeActions";
import { getDb } from "$lib/server/storage/db/db";
import { getRegisteredApplicationById } from "$lib/server/storage/repositories/customerApplicationXrefRepository";
import { getQualifyingTrialJobIds, listRecipesForApplication } from "$lib/server/storage/repositories/recipeRepository";

export const GET: RequestHandler = ({ params }) => {
	const db = getDb();
	const registeredApplicationId = Number(params.id);
	const registeredApplication = Number.isNaN(registeredApplicationId) ? undefined : getRegisteredApplicationById(db, registeredApplicationId);
	if (!registeredApplication) {
		return json({ error: `Registered Application ${params.id} not found` }, { status: 404 });
	}

	const recipes = listRecipesForApplication(db, registeredApplication.id);
	const qualifyingTrialJobIds = getQualifyingTrialJobIds(db, recipes.map((recipe) => recipe.id));
	return json({ data: toRecipeSummaries(recipes, qualifyingTrialJobIds) }, { status: 200 });
};
