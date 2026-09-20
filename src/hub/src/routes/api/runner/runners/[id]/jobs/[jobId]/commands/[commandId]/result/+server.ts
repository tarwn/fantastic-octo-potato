import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { reportCommandResult } from "$lib/server/runner/interventionCommandActions";
import { requireRunnerSharedSecret } from "$lib/server/runner/runnerConfig";
import { getDb } from "$lib/server/storage/db/db";

export const POST: RequestHandler = async ({ params, request }) => {
	const result = reportCommandResult(
		getDb(),
		params.id,
		params.jobId,
		params.commandId,
		request.headers.get("authorization"),
		requireRunnerSharedSecret(),
		await request.json().catch(() => undefined)
	);

	return json(result.body, { status: result.status });
};
