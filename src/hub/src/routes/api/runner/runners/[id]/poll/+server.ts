import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { runnerPoll } from "$lib/server/runnerActions";
import { requireRunnerSharedSecret } from "$lib/server/runnerConfig";
import { getDb } from "$lib/server/storage/db";

export const POST: RequestHandler = ({ params, request }) => {
	const result = runnerPoll(getDb(), params.id, request.headers.get("authorization"), requireRunnerSharedSecret());

	return json(result.body, { status: result.status });
};
