import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { getDb } from "$lib/server/db/db";
import { createJob } from "$lib/server/jobActions";

export const POST: RequestHandler = async ({ params, request }) => {
	const body = await request.json();
	const result = createJob(getDb(), params.id, body);

	return json(result.body, { status: result.status });
};
