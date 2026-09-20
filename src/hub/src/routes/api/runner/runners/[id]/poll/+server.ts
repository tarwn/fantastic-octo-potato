import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { runnerPoll } from "$lib/server/runner/runnerActions";
import { requireRunnerSharedSecret } from "$lib/server/runner/runnerConfig";
import { getDb } from "$lib/server/storage/db/db";

export const POST: RequestHandler = ({ params, request }) => {
	const result = runnerPoll(getDb(), params.id, request.headers.get("authorization"), requireRunnerSharedSecret());

	return json(result.body, { status: result.status });
};
