import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { getDb } from "$lib/server/db/db";
import { getJobDetail } from "$lib/server/jobActions";

export const GET: RequestHandler = ({ params }) => {
	const result = getJobDetail(getDb(), params.id);

	return json(result.body, { status: result.status });
};
