import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { listRecipesAction } from "$lib/server/recipe/recipeActions";
import { getDb } from "$lib/server/storage/db/db";

export const GET: RequestHandler = ({ params }) => {
	const result = listRecipesAction(getDb(), params.id);

	return json(result.body, { status: result.status });
};
