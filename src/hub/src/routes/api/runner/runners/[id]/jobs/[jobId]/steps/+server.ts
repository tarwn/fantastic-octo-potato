import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { reportJobStep } from "$lib/server/runner/runnerActions";
import { requireRunnerSharedSecret } from "$lib/server/runner/runnerConfig";
import { getDb } from "$lib/server/storage/db/db";

export const POST: RequestHandler = async ({ params, request }) => {
	const body = await request.json();
	const result = await reportJobStep(
		getDb(),
		params.id,
		params.jobId,
		request.headers.get("authorization"),
		requireRunnerSharedSecret(),
		body
	);

	return json(result.body, { status: result.status });
};
