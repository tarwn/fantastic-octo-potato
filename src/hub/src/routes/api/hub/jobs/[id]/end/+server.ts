import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { endJob } from "$lib/server/jobs/interventionActions";
import { getDb } from "$lib/server/storage/db/db";

export const POST: RequestHandler = async ({ params, request }) => {
	const result = endJob(getDb(), params.id, await request.json().catch(() => undefined));

	return json(result.body, { status: result.status });
};
