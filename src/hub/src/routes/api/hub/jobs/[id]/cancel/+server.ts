import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { cancelJob } from "$lib/server/jobActions";
import { getDb } from "$lib/server/storage/db";

export const POST: RequestHandler = ({ params }) => {
	const result = cancelJob(getDb(), params.id);

	return json(result.body, { status: result.status });
};
