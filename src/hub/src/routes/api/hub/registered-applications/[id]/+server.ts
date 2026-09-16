import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { getDb } from "$lib/server/db/db";
import { getRegisteredApplicationById } from "$lib/server/repositories/customerApplicationXrefRepository";
import { listRunningJobIdsByRunnerId } from "$lib/server/repositories/jobRepository";
import { listRunnersByCustomerApplicationXrefId } from "$lib/server/repositories/runnerRepository";
import type { RegisteredApplicationDetail } from "$lib/types/registeredApplication";

export const GET: RequestHandler = ({ params }) => {
	const id = Number(params.id);
	const registeredApplication = Number.isNaN(id) ? undefined : getRegisteredApplicationById(getDb(), id);

	if (!registeredApplication) {
		return json({ error: `Registered Application ${params.id} not found` }, { status: 404 });
	}

	const runnerRows = listRunnersByCustomerApplicationXrefId(getDb(), registeredApplication.id);
	const runningJobIdByRunnerId = listRunningJobIdsByRunnerId(
		getDb(),
		runnerRows.map((runner) => runner.id)
	);
	const runners = runnerRows.map((runner) => ({
		id: runner.id,
		lastHeartbeatOn: runner.lastHeartbeatOn,
		currentJobId: runningJobIdByRunnerId.get(runner.id) ?? null
	}));

	return json({
		data: {
			id: registeredApplication.id,
			customerName: registeredApplication.customerName,
			applicationName: registeredApplication.applicationName,
			runners
		} satisfies RegisteredApplicationDetail
	});
};
