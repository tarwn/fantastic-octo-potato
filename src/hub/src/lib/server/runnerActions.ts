import type Database from "better-sqlite3";

import { JobStatus } from "./db/jobStatus";
import { TranscriptKind } from "./db/jobTranscriptKind";
import { JobType } from "./db/jobType";
import { SensitivityType } from "./db/sensitivityType";
import {
	appendAutoSequencedTranscriptEntry,
	appendTranscriptEntry,
	claimNextJobForRunner,
	getJobById,
	getSafeJobIngredientByFieldName,
	JOB_CLAIMED_SEQUENCE,
	maskValue,
	TERMINAL_JOB_STATUSES,
	terminalTranscriptSequence,
	type TranscriptFieldRef,
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

// halt is deliberately excluded — it's a schema/enum slot for a future Intervention-Requested
// status change, not something a Runner can submit as free text this spec.
export type ReportStepBody =
	| { kind: "status"; status: JobStatus; message: string }
	| { kind: "info"; message: string }
	| { kind: "step"; sequence: number; message: string; inputs: string[]; outputs: Array<{ fieldName: string; value: string }> }
	| { kind: "recover"; message: string }
	| { kind: "observe"; message: string }
	| { kind: "plan"; message: string };

const NON_STEP_TRANSCRIPT_KIND: Record<"info" | "recover" | "observe" | "plan", Exclude<TranscriptKind, TranscriptKind.Step>> = {
	info: TranscriptKind.Info,
	recover: TranscriptKind.Recover,
	observe: TranscriptKind.Observe,
	plan: TranscriptKind.Plan
};

const JOB_STATUS_VALUES = Object.values(JobStatus).filter((value): value is JobStatus => typeof value === "number");

function isJobStatus(value: unknown): value is JobStatus {
	return typeof value === "number" && JOB_STATUS_VALUES.includes(value as JobStatus);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function parseMessage(body: Record<string, unknown>): string | undefined {
	return typeof body.message === "string" && body.message.trim() !== "" ? body.message : undefined;
}

type ParseResult = { ok: true; value: ReportStepBody } | { ok: false; error: string };

// Validates the discriminant and per-kind required fields before any DB write — an
// unrecognized kind or a kind/field mismatch is a 400, never a partially-applied write.
function parseReportStepBody(body: unknown): ParseResult {
	if (!isRecord(body) || typeof body.kind !== "string" || body.kind.trim() === "") {
		return { ok: false, error: "kind is required" };
	}

	switch (body.kind) {
		case "status": {
			if (!isJobStatus(body.status)) {
				return { ok: false, error: "status must be a valid JobStatus" };
			}
			const message = parseMessage(body);
			if (message === undefined) {
				return { ok: false, error: "message is required" };
			}
			return { ok: true, value: { kind: "status", status: body.status, message } };
		}
		case "info":
		case "recover":
		case "observe":
		case "plan": {
			const message = parseMessage(body);
			if (message === undefined) {
				return { ok: false, error: "message is required" };
			}
			return { ok: true, value: { kind: body.kind as "info" | "recover" | "observe" | "plan", message } };
		}
		case "step": {
			if (!Number.isInteger(body.sequence) || (body.sequence as number) <= 0) {
				return { ok: false, error: "sequence must be a positive integer" };
			}
			const message = parseMessage(body);
			if (message === undefined) {
				return { ok: false, error: "message is required" };
			}
			if (!Array.isArray(body.inputs) || !body.inputs.every((value): value is string => typeof value === "string")) {
				return { ok: false, error: "inputs must be an array of field names" };
			}
			if (
				!Array.isArray(body.outputs) ||
				!body.outputs.every(
					(value): value is { fieldName: string; value: string } =>
						isRecord(value) && typeof value.fieldName === "string" && typeof value.value === "string"
				)
			) {
				return { ok: false, error: "outputs must be an array of { fieldName, value }" };
			}
			return {
				ok: true,
				value: { kind: "step", sequence: body.sequence as number, message, inputs: body.inputs, outputs: body.outputs }
			};
		}
		default:
			return { ok: false, error: `Unrecognized kind: ${body.kind}` };
	}
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

	const now = new Date();
	updateRunnerHeartbeat(db, runner.id, now);

	const job = claimNextJobForRunner(db, runner.customerApplicationXrefId, runner.id, now);
	if (!job) {
		return { status: 200, body: { data: { hasWork: false } } };
	}
	if (job.jobType !== JobType.Training) {
		throw new Error(`Job ${job.id} is not a Training Job — only Training Jobs are claimable`);
	}

	appendTranscriptEntry(db, job.id, JOB_CLAIMED_SEQUENCE, TranscriptKind.Status, `Picked up by Runner ${runner.id}`, now, JobStatus.Running);

	// The claim hands back scripted step 1 too, so the Runner has something to perform before its first `steps` call.
	const firstStep = SCRIPTED_TRAINING_STEPS[0];
	return {
		status: 200,
		body: {
			data: {
				hasWork: true,
				job: {
					id: job.id,
					goal: job.details.goal,
					startingUrl: job.details.startingUrl,
					allowlist: job.details.allowlist,
					maxSteps: job.details.maxSteps,
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
	body: unknown
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
	if (job.jobType !== JobType.Training) {
		throw new Error(`Job ${rawJobId} is not a Training Job — only Training Jobs report steps`);
	}

	const parsed = parseReportStepBody(body);
	if (!parsed.ok) {
		return { status: 400, body: { error: parsed.error } };
	}

	if (TERMINAL_JOB_STATUSES.includes(job.jobStatusId)) {
		return { status: 200, body: { data: { jobStatusId: job.jobStatusId } } };
	}

	const now = new Date();

	if (parsed.value.kind === "status") {
		appendAutoSequencedTranscriptEntry(db, job.id, TranscriptKind.Status, parsed.value.message, now, parsed.value.status);
		updateJobHeartbeat(db, job.id, now);
		updateRunnerHeartbeat(db, runner.id, now);
		return { status: 200, body: { data: { jobStatusId: parsed.value.status } } };
	}

	if (parsed.value.kind !== "step") {
		appendAutoSequencedTranscriptEntry(db, job.id, NON_STEP_TRANSCRIPT_KIND[parsed.value.kind], parsed.value.message, now);
		updateJobHeartbeat(db, job.id, now);
		updateRunnerHeartbeat(db, runner.id, now);
		return { status: 200, body: { data: { jobStatusId: job.jobStatusId } } };
	}

	const step = parsed.value;

	const resolvedInputs: TranscriptFieldRef[] = [];
	for (const fieldName of step.inputs) {
		const ingredient = getSafeJobIngredientByFieldName(db, job.id, fieldName);
		if (!ingredient) {
			return { status: 400, body: { error: `Unknown ingredient: ${fieldName}` } };
		}
		resolvedInputs.push(ingredient);
	}

	const resolvedOutputs: TranscriptFieldRef[] = [];
	for (const output of step.outputs) {
		const sensitivityType = SCRIPTED_TRAINING_STEPS.find((s) => s.resultField === output.fieldName)?.sensitivityType ?? SensitivityType.None;
		upsertJobResult(db, job.id, output.fieldName, output.value, sensitivityType, now);
		resolvedOutputs.push({ fieldName: output.fieldName, safeValue: maskValue(output.value, sensitivityType), sensitivityType });
	}

	appendTranscriptEntry(
		db,
		job.id,
		step.sequence,
		TranscriptKind.Step,
		{ message: step.message, inputs: resolvedInputs, outputs: resolvedOutputs },
		now
	);
	updateJobHeartbeat(db, job.id, now);
	updateRunnerHeartbeat(db, runner.id, now);

	if (step.sequence >= job.details.maxSteps) {
		updateJobStatus(db, job.id, JobStatus.CompletedFailed, now);
		appendTranscriptEntry(
			db,
			job.id,
			terminalTranscriptSequence(job.details.maxSteps),
			TranscriptKind.Status,
			"Reached max steps, marked Completed-Failed",
			now,
			JobStatus.CompletedFailed
		);
		return { status: 200, body: { data: { jobStatusId: JobStatus.CompletedFailed } } };
	}

	if (step.sequence >= SCRIPTED_TRAINING_STEPS.length) {
		updateJobStatus(db, job.id, JobStatus.CompletedSuccess, now);
		appendTranscriptEntry(
			db,
			job.id,
			terminalTranscriptSequence(job.details.maxSteps),
			TranscriptKind.Status,
			"Run finished, marked Completed-Success",
			now,
			JobStatus.CompletedSuccess
		);
		return { status: 200, body: { data: { jobStatusId: JobStatus.CompletedSuccess } } };
	}

	const next = SCRIPTED_TRAINING_STEPS[step.sequence];
	return {
		status: 200,
		body: {
			data: {
				jobStatusId: JobStatus.Running,
				nextStep: { sequence: step.sequence + 1, kind: next.kind, text: next.text }
			}
		}
	};
}
