import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { handBack } from "$lib/server/jobs/interventionActions";
import { getDb } from "$lib/server/storage/db/db";

export const POST: RequestHandler = async ({ params, request }) => {
	const result = handBack(getDb(), params.id, await request.json().catch(() => undefined));

	return json(result.body, { status: result.status });
};
