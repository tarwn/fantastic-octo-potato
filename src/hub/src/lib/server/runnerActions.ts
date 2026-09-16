import type Database from "better-sqlite3";

import { JobStatus } from "./db/jobStatus";
import {
	appendTranscriptEntry,
	claimNextJobForRunner,
	getJobById,
	TERMINAL_JOB_STATUSES,
	updateJobHeartbeat,
	updateJobStatus,
	upsertJobResult
} from "./repositories/jobRepository";
import { getRunnerById, updateRunnerHeartbeat } from "./repositories/runnerRepository";
import { SCRIPTED_TRAINING_STEPS } from "./scriptedTrainingSteps";

export interface RunnerActionResult {
	status: number;
	body: { data: unknown } | { error: string };
}

export interface ReportStepBody {
	sequence: number;
	kind: string;
	text: string;
	resultField?: string;
	resultValue?: string;
}

function requireRunnerBearerAuth(authHeader: string | null, sharedSecret: string): boolean {
	return authHeader === `Bearer ${sharedSecret}`;
}

function findRunner(db: Database.Database, rawId: string) {
	const id = Number(rawId);
	return Number.isNaN(id) ? undefined : getRunnerById(db, id);
}

export function runnerInit(
	db: Database.Database,
	rawId: string,
	authHeader: string | null,
	sharedSecret: string,
	pollIntervalSeconds: number,
	interventionTimeoutSeconds: number
): RunnerActionResult {
	if (!requireRunnerBearerAuth(authHeader, sharedSecret)) {
		return { status: 401, body: { error: "Unauthorized" } };
	}

	const runner = findRunner(db, rawId);
	if (!runner) {
		return { status: 404, body: { error: `Runner ${rawId} not found` } };
	}

	updateRunnerHeartbeat(db, runner.id, new Date());

	return { status: 200, body: { data: { pollIntervalSeconds, interventionTimeoutSeconds } } };
}

export function runnerPoll(
	db: Database.Database,
	rawId: string,
	authHeader: string | null,
	sharedSecret: string
): RunnerActionResult {
	if (!requireRunnerBearerAuth(authHeader, sharedSecret)) {
		return { status: 401, body: { error: "Unauthorized" } };
	}

	const runner = findRunner(db, rawId);
	if (!runner) {
		return { status: 404, body: { error: `Runner ${rawId} not found` } };
	}

	updateRunnerHeartbeat(db, runner.id, new Date());

	const job = claimNextJobForRunner(db, runner.customerApplicationXrefId, runner.id, new Date());
	if (!job) {
		return { status: 200, body: { data: { hasWork: false } } };
	}

	// The claim hands back scripted step 1 too, so the Runner has something to perform before its first `steps` call.
	const firstStep = SCRIPTED_TRAINING_STEPS[0];
	return {
		status: 200,
		body: {
			data: {
				hasWork: true,
				job: {
					id: job.id,
					goal: job.goal,
					startingUrl: job.startingUrl,
					allowlist: job.allowlist,
					maxSteps: job.maxSteps,
					nextStep: { sequence: 1, kind: firstStep.kind, text: firstStep.text }
				}
			}
		}
	};
}

function findJob(db: Database.Database, rawJobId: string) {
	const id = Number(rawJobId);
	return Number.isNaN(id) ? undefined : getJobById(db, id);
}

// Reports the outcome of step `sequence` and, in the same call, returns the next scripted step or the terminal status; an already-terminal Job is returned as-is, unmutated.
export function reportJobStep(
	db: Database.Database,
	rawRunnerId: string,
	rawJobId: string,
	authHeader: string | null,
	sharedSecret: string,
	body: ReportStepBody
): RunnerActionResult {
	if (!requireRunnerBearerAuth(authHeader, sharedSecret)) {
		return { status: 401, body: { error: "Unauthorized" } };
	}

	const runner = findRunner(db, rawRunnerId);
	if (!runner) {
		return { status: 404, body: { error: `Runner ${rawRunnerId} not found` } };
	}

	const job = findJob(db, rawJobId);
	if (!job) {
		return { status: 404, body: { error: `Job ${rawJobId} not found` } };
	}

	if (job.runnerId !== runner.id) {
		return { status: 403, body: { error: `Runner ${rawRunnerId} is not assigned to Job ${rawJobId}` } };
	}

	if (!Number.isInteger(body.sequence) || body.sequence <= 0) {
		return { status: 400, body: { error: "sequence must be a positive integer" } };
	}
	if (typeof body.kind !== "string" || body.kind.trim() === "") {
		return { status: 400, body: { error: "kind is required" } };
	}
	if (typeof body.text !== "string" || body.text.trim() === "") {
		return { status: 400, body: { error: "text is required" } };
	}

	if (TERMINAL_JOB_STATUSES.includes(job.jobStatusId)) {
		return { status: 200, body: { data: { jobStatusId: job.jobStatusId } } };
	}

	const now = new Date();
	appendTranscriptEntry(db, job.id, body.sequence, body.kind, body.text, now);
	if (body.resultField) {
		upsertJobResult(db, job.id, body.resultField, body.resultValue ?? "", now);
	}
	updateJobHeartbeat(db, job.id, now);
	updateRunnerHeartbeat(db, runner.id, now);

	if (body.sequence >= job.maxSteps) {
		updateJobStatus(db, job.id, JobStatus.CompletedFailed, now);
		return { status: 200, body: { data: { jobStatusId: JobStatus.CompletedFailed } } };
	}

	if (body.sequence >= SCRIPTED_TRAINING_STEPS.length) {
		updateJobStatus(db, job.id, JobStatus.CompletedSuccess, now);
		return { status: 200, body: { data: { jobStatusId: JobStatus.CompletedSuccess } } };
	}

	const next = SCRIPTED_TRAINING_STEPS[body.sequence];
	return {
		status: 200,
		body: {
			data: {
				jobStatusId: JobStatus.Running,
				nextStep: { sequence: body.sequence + 1, kind: next.kind, text: next.text }
			}
		}
	};
}
