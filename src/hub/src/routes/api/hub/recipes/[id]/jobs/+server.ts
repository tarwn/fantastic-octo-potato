import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { createRecipeJobAction } from "$lib/server/recipeActions";
import { getDb } from "$lib/server/storage/db";

export const POST: RequestHandler = async ({ params, request }) => {
	const body = await request.json();
	const result = createRecipeJobAction(getDb(), params.id, body);

	return json(result.body, { status: result.status });
};
