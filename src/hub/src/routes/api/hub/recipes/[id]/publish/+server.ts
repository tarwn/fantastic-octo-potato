import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { publishRecipeAction } from "$lib/server/recipe/publishRecipeAction";
import { getDb } from "$lib/server/storage/db/db";

export const POST: RequestHandler = async ({ params, request }) => {
	const body: unknown = await request.json().catch(() => undefined);
	if (typeof body !== "object" || body === null) {
		return json({ error: "Request body must be a JSON object" }, { status: 400 });
	}

	const result = publishRecipeAction(getDb(), params.id, body);

	return json(result.body, { status: result.status });
};
