import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { getDb } from "$lib/server/db/db";
import { listJobsAction } from "$lib/server/jobActions";

export const GET: RequestHandler = () => {
	const result = listJobsAction(getDb());

	return json(result.body, { status: result.status });
};
