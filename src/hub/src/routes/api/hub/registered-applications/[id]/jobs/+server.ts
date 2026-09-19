import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { createJob } from "$lib/server/jobActions";
import { getDb } from "$lib/server/storage/db";

export const POST: RequestHandler = async ({ params, request }) => {
	const body = await request.json();
	const result = await createJob(getDb(), params.id, body);

	return json(result.body, { status: result.status });
};
