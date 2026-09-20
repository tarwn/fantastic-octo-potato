import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { createRecipeJob } from "$lib/server/jobs/recipeJobs/createRecipeJob";
import { getDb } from "$lib/server/storage/db/db";

export const POST: RequestHandler = async ({ params, request }) => {
	const body = await request.json();
	const result = createRecipeJob(getDb(), params.id, body);

	return json(result.body, { status: result.status });
};
