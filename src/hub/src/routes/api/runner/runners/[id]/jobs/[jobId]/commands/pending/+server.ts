import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { getPendingCommand } from "$lib/server/runner/interventionCommandActions";
import { requireRunnerSharedSecret } from "$lib/server/runner/runnerConfig";
import { getDb } from "$lib/server/storage/db/db";

export const GET: RequestHandler = ({ params, request }) => {
	const result = getPendingCommand(getDb(), params.id, params.jobId, request.headers.get("authorization"), requireRunnerSharedSecret());

	return json(result.body, { status: result.status });
};
