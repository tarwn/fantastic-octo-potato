import { TranscriptKind } from "$lib/jobTranscriptKind";
import { JobType } from "$lib/jobType";
import type { Job, JobDetail, JobTranscriptEntry } from "$lib/types/job";

// The built-in Omit doesn't distribute over a union, so it would collapse Job's discriminated
// union (jobType/details, kind/text) into an uncorrelated shape — this variant re-distributes
// so each wire-response type stays as narrowable as the domain type it mirrors.
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

// Wire shape: dates cross the API as ISO-8601 text (JSON has no date type); parsed into
// Date below so nothing outside this module handles a raw date string.
export type JobResponse = DistributiveOmit<Job, "createdAt" | "startedAt" | "heartbeatOn" | "completedAt"> & {
	createdAt: string;
	startedAt: string | null;
	heartbeatOn: string | null;
	completedAt: string | null;
};

type JobTranscriptEntryResponse = DistributiveOmit<JobTranscriptEntry, "createdAt"> & {
	createdAt: string;
};

type JobStepArtifactResponse = Omit<JobDetail["artifacts"][number], "createdAt"> & { createdAt: string };

type JobDetailResponse = JobResponse & {
	transcript: JobTranscriptEntryResponse[];
	results: JobDetail["results"];
	ingredients: JobDetail["ingredients"];
	artifacts: JobStepArtifactResponse[];
};

export interface StartTrainingRunRequested {
	goal: string;
	startingUrl: string;
	maxSteps: number;
}

// Branching on the discriminant before spreading keeps TypeScript's narrowing intact —
// spreading straight off the union type widens `jobType` and decorrelates it from `details`.
// The two branch bodies are intentionally identical: narrowing `job` is the only effect that
// matters here, so don't collapse this back into a single `return` — that reintroduces the
// widened, uncorrelated type the branch exists to avoid.
export function parseJob(job: JobResponse): Job {
	const dates = {
		createdAt: new Date(job.createdAt),
		startedAt: job.startedAt === null ? null : new Date(job.startedAt),
		heartbeatOn: job.heartbeatOn === null ? null : new Date(job.heartbeatOn),
		completedAt: job.completedAt === null ? null : new Date(job.completedAt)
	};
	if (job.jobType === JobType.Training) {
		return { ...job, ...dates };
	}
	return { ...job, ...dates };
}

// See parseJob's comment — the identical branch bodies are load-bearing for narrowing, not dead code.
function parseTranscriptEntry(entry: JobTranscriptEntryResponse): JobTranscriptEntry {
	const createdAt = new Date(entry.createdAt);
	if (entry.kind === TranscriptKind.Step) {
		return { ...entry, createdAt };
	}
	return { ...entry, createdAt };
}

function parseJobDetail(job: JobDetailResponse): JobDetail {
	return {
		...parseJob(job),
		transcript: job.transcript.map(parseTranscriptEntry),
		results: job.results,
		ingredients: job.ingredients,
		artifacts: job.artifacts.map((artifact) => ({ ...artifact, createdAt: new Date(artifact.createdAt) }))
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
