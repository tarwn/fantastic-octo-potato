import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { getDb } from "$lib/server/db/db";
import { runnerPoll } from "$lib/server/runnerActions";
import { requireRunnerSharedSecret } from "$lib/server/runnerConfig";

export const POST: RequestHandler = ({ params, request }) => {
	const result = runnerPoll(getDb(), params.id, request.headers.get("authorization"), requireRunnerSharedSecret());

	return json(result.body, { status: result.status });
};
