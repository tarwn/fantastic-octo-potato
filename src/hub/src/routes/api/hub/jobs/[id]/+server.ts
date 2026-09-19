import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { getJobDetail } from "$lib/server/jobs/jobActions";
import { getDb } from "$lib/server/storage/db/db";

export const GET: RequestHandler = ({ params }) => {
	const result = getJobDetail(getDb(), params.id);

	return json(result.body, { status: result.status });
};
