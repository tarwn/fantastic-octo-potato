import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { getDb } from "$lib/server/db/db";
import { cancelJob } from "$lib/server/jobActions";

export const POST: RequestHandler = ({ params }) => {
	const result = cancelJob(getDb(), params.id);

	return json(result.body, { status: result.status });
};
