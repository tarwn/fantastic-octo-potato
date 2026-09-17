import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { getDb } from "$lib/server/db/db";
import { listRecipesAction } from "$lib/server/recipeActions";

export const GET: RequestHandler = ({ params }) => {
	const result = listRecipesAction(getDb(), params.id);

	return json(result.body, { status: result.status });
};
