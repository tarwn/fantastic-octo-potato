import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { listJobsAction } from "$lib/server/jobActions";
import { getDb } from "$lib/server/storage/db";

export const GET: RequestHandler = () => {
	const result = listJobsAction(getDb());

	return json(result.body, { status: result.status });
};
