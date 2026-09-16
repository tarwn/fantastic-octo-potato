import type { Job, JobDetail, JobResult, JobTranscriptEntry } from "$lib/types/job";

// Wire shape: dates cross the API as ISO-8601 text (JSON has no date type); parsed into
// Date below so nothing outside this module handles a raw date string.
interface JobResponse extends Omit<Job, "createdAt" | "startedAt" | "heartbeatOn" | "completedAt"> {
	createdAt: string;
	startedAt: string | null;
	heartbeatOn: string | null;
	completedAt: string | null;
}

interface JobTranscriptEntryResponse extends Omit<JobTranscriptEntry, "createdAt"> {
	createdAt: string;
}

interface JobResultResponse extends Omit<JobResult, "createdAt"> {
	createdAt: string;
}

interface JobDetailResponse extends JobResponse {
	transcript: JobTranscriptEntryResponse[];
	results: JobResultResponse[];
}

export interface StartTrainingRunRequested {
	goal: string;
	startingUrl: string;
	maxSteps: number;
}

function parseJob(job: JobResponse): Job {
	return {
		...job,
		createdAt: new Date(job.createdAt),
		startedAt: job.startedAt === null ? null : new Date(job.startedAt),
		heartbeatOn: job.heartbeatOn === null ? null : new Date(job.heartbeatOn),
		completedAt: job.completedAt === null ? null : new Date(job.completedAt)
	};
}

function parseJobDetail(job: JobDetailResponse): JobDetail {
	return {
		...parseJob(job),
		transcript: job.transcript.map((entry) => ({ ...entry, createdAt: new Date(entry.createdAt) })),
		results: job.results.map((result) => ({ ...result, createdAt: new Date(result.createdAt) }))
	};
}

export async function fetchJobs(): Promise<Job[]> {
	const response = await fetch("/api/hub/jobs");
	const body = (await response.json()) as { data: JobResponse[] };
	return body.data.map(parseJob);
}

export async function fetchJob(id: number): Promise<JobDetail> {
	const response = await fetch(`/api/hub/jobs/${id}`);
	const body = (await response.json()) as { data: JobDetailResponse } | { error: string };
	if ("error" in body) {
		throw new Error(body.error);
	}
	return parseJobDetail(body.data);
}

export async function startTrainingRun(registeredApplicationId: number, request: StartTrainingRunRequested): Promise<Job> {
	const response = await fetch(`/api/hub/registered-applications/${registeredApplicationId}/jobs`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(request)
	});
	const body = (await response.json()) as { data: JobResponse } | { error: string };
	if ("error" in body) {
		throw new Error(body.error);
	}
	return parseJob(body.data);
}

export async function cancelJob(id: number): Promise<Job> {
	const response = await fetch(`/api/hub/jobs/${id}/cancel`, { method: "POST" });
	const body = (await response.json()) as { data: JobResponse } | { error: string };
	if ("error" in body) {
		throw new Error(body.error);
	}
	return parseJob(body.data);
}
