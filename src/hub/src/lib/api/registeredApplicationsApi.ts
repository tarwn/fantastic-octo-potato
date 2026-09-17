import type { RegisteredApplication, RegisteredApplicationDetail } from "$lib/types/registeredApplication";

// Wire shape: dates cross the API as ISO-8601 text (JSON has no date type); parsed into
// Date below so nothing outside this module handles a raw date string.
interface RegisteredApplicationDetailResponse extends Omit<RegisteredApplicationDetail, "runners"> {
	runners: { id: number; lastHeartbeatOn: string | null; currentJobId: number | null }[];
}

export async function fetchRegisteredApplications(): Promise<RegisteredApplication[]> {
	const response = await fetch("/api/hub/registered-applications");
	const body = (await response.json()) as { data: RegisteredApplication[] };
	return body.data;
}

export async function fetchRegisteredApplication(id: number): Promise<RegisteredApplicationDetail> {
	const response = await fetch(`/api/hub/registered-applications/${id}`);
	const body = (await response.json()) as { data: RegisteredApplicationDetailResponse } | { error: string };
	if ("error" in body) {
		throw new Error(body.error);
	}
	return {
		...body.data,
		runners: body.data.runners.map((runner) => ({
			...runner,
			lastHeartbeatOn: runner.lastHeartbeatOn === null ? null : new Date(runner.lastHeartbeatOn)
		}))
	};
}
