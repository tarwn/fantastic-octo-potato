import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { runnerInit } from "$lib/server/runnerActions";
import { getInterventionTimeoutSeconds, getPollIntervalSeconds, requireRunnerSharedSecret } from "$lib/server/runnerConfig";
import { getDb } from "$lib/server/storage/db";

export const POST: RequestHandler = ({ params, request }) => {
	const result = runnerInit(
		getDb(),
		params.id,
		request.headers.get("authorization"),
		requireRunnerSharedSecret(),
		getPollIntervalSeconds(),
		getInterventionTimeoutSeconds()
	);

	return json(result.body, { status: result.status });
};
