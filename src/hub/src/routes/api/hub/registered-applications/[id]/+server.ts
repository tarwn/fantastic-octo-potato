import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { getRegisteredApplicationById } from "$lib/server/storage/customerApplicationXrefRepository";
import { getDb } from "$lib/server/storage/db";
import { listRunningJobIdsByRunnerId } from "$lib/server/storage/jobRepository";
import { listRunnersByCustomerApplicationXrefId } from "$lib/server/storage/runnerRepository";
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
