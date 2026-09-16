import type Database from "better-sqlite3";

import { JobStatus } from "./db/jobStatus";
import { getRegisteredApplicationById } from "./repositories/customerApplicationXrefRepository";
import {
	getJobById,
	insertJob,
	listJobResults,
	listJobs,
	listTranscriptEntries,
	TERMINAL_JOB_STATUSES,
	updateJobStatus
} from "./repositories/jobRepository";

export interface JobActionResult {
	status: number;
	body: { data: unknown } | { error: string };
}

interface CreateJobBody {
	goal?: unknown;
	startingUrl?: unknown;
	maxSteps?: unknown;
}

function deriveAllowlist(startingUrl: string): string | undefined {
	try {
		return new URL(startingUrl).origin;
	}
	catch {
		return undefined;
	}
}

export function createJob(db: Database.Database, rawRegisteredApplicationId: string, body: CreateJobBody): JobActionResult {
	const registeredApplicationId = Number(rawRegisteredApplicationId);
	const registeredApplication = Number.isNaN(registeredApplicationId)
		? undefined
		: getRegisteredApplicationById(db, registeredApplicationId);
	if (!registeredApplication) {
		return { status: 404, body: { error: `Registered Application ${rawRegisteredApplicationId} not found` } };
	}

	const goal = typeof body.goal === "string" ? body.goal.trim() : "";
	if (!goal) {
		return { status: 400, body: { error: "goal is required" } };
	}

	const startingUrl = typeof body.startingUrl === "string" ? body.startingUrl.trim() : "";
	const allowlist = deriveAllowlist(startingUrl);
	if (!allowlist) {
		return { status: 400, body: { error: "startingUrl must be a valid URL" } };
	}

	const maxSteps = typeof body.maxSteps === "number" ? body.maxSteps : Number(body.maxSteps);
	if (!Number.isInteger(maxSteps) || maxSteps <= 0) {
		return { status: 400, body: { error: "maxSteps must be a positive integer" } };
	}

	const job = insertJob(db, {
		customerApplicationXrefId: registeredApplication.id,
		mode: "training",
		goal,
		startingUrl,
		allowlist,
		maxSteps,
		createdAt: new Date()
	});

	return { status: 201, body: { data: job } };
}

export function listJobsAction(db: Database.Database): JobActionResult {
	return { status: 200, body: { data: listJobs(db) } };
}

export function getJobDetail(db: Database.Database, rawId: string): JobActionResult {
	const id = Number(rawId);
	const job = Number.isNaN(id) ? undefined : getJobById(db, id);
	if (!job) {
		return { status: 404, body: { error: `Job ${rawId} not found` } };
	}

	return {
		status: 200,
		body: {
			data: {
				...job,
				transcript: listTranscriptEntries(db, job.id),
				results: listJobResults(db, job.id)
			}
		}
	};
}

export function cancelJob(db: Database.Database, rawId: string): JobActionResult {
	const id = Number(rawId);
	const job = Number.isNaN(id) ? undefined : getJobById(db, id);
	if (!job) {
		return { status: 404, body: { error: `Job ${rawId} not found` } };
	}

	if (TERMINAL_JOB_STATUSES.includes(job.jobStatusId)) {
		return { status: 409, body: { error: `Job ${rawId} is already in a terminal status` } };
	}

	const completedAt = new Date();
	updateJobStatus(db, job.id, JobStatus.CompletedCancelled, completedAt);

	return { status: 200, body: { data: getJobById(db, job.id) } };
}
