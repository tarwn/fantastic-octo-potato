import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { submitCommand, submitPromptCommand } from "$lib/server/jobs/interventionActions";
import { getDb } from "$lib/server/storage/db/db";

export const POST: RequestHandler = async ({ params, request }) => {
	const body: unknown = await request.json().catch(() => undefined);
	const isPrompt = typeof body === "object" && body !== null && "kind" in body && body.kind === "prompt";
	const result = isPrompt ? await submitPromptCommand(getDb(), params.id, body) : submitCommand(getDb(), params.id, body);

	return json(result.body, { status: result.status });
};
