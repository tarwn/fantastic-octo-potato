import type { JobStatus } from "$lib/jobStatus";

export type JobMode = "training";

export interface Job {
	id: number;
	customerApplicationXrefId: number;
	mode: JobMode;
	jobStatusId: JobStatus;
	goal: string;
	startingUrl: string;
	allowlist: string;
	maxSteps: number;
	runnerId: number | null;
	createdAt: Date;
	startedAt: Date | null;
	heartbeatOn: Date | null;
	completedAt: Date | null;
}

export interface JobTranscriptEntry {
	id: number;
	jobId: number;
	sequence: number;
	kind: string;
	text: string;
	createdAt: Date;
	// Set only on a "status" kind entry — the Job's new status, captured at the same
	// moment the transcript row was written.
	jobStatusId: JobStatus | null;
	// Not populated by the backend yet (docs/specs/0006-job-queue) — kept here so
	// TranscriptPanel's redacted-value rendering doesn't need to be reintroduced later.
	redacted?: string;
	pii?: boolean;
}

export interface JobResult {
	id: number;
	jobId: number;
	fieldName: string;
	value: string;
	createdAt: Date;
	// Not populated by the backend yet (docs/specs/0006-job-queue) — kept here so
	// ResultsPanel's pending/redacted rendering doesn't need to be reintroduced later.
	pending?: boolean;
	redacted?: boolean;
}

export interface JobDetail extends Job {
	transcript: JobTranscriptEntry[];
	results: JobResult[];
}
