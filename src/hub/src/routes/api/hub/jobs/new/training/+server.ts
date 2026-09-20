import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { createTrainingRunJob } from "$lib/server/jobs/trainingRunJobs/createTrainingRunJob";
import { getDb } from "$lib/server/storage/db/db";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	if (!isRecord(body) || typeof body.registeredApplicationId !== "string" && typeof body.registeredApplicationId !== "number") {
		return json({ error: "registeredApplicationId is required" }, { status: 400 });
	}

	const result = await createTrainingRunJob(getDb(), String(body.registeredApplicationId), body);

	return json(result.body, { status: result.status });
};
