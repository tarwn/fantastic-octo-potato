import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { reportJobStep } from "$lib/server/runnerActions";
import { requireRunnerSharedSecret } from "$lib/server/runnerConfig";
import { getDb } from "$lib/server/storage/db";

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
