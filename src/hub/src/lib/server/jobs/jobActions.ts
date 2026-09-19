import type Database from "better-sqlite3";

import { readJobStepArtifact, writeJobStepArtifact } from "../storage/artifactStorage";
import { JobStatus } from "../storage/db/jobStatus";
import { TranscriptKind } from "../storage/db/jobTranscriptKind";
import { JobType } from "../storage/db/jobType";
import { getRegisteredApplicationById } from "../storage/repositories/customerApplicationXrefRepository";
import {
	appendAutoSequencedTranscriptEntry,
	appendTranscriptEntry,
	claimNextJobForRunner,
	getJobById,
	getJobStepArtifactById,
	insertJobStepArtifact,
	type Job,
	JOB_CLAIMED_SEQUENCE,
	listJobs,
	listJobStepArtifactsForJob,
	listSafeJobIngredients,
	listSafeJobResults,
	listTranscriptEntries,
	TERMINAL_JOB_STATUSES,
	terminalTranscriptSequence,
	updateJobHeartbeat,
	updateJobStatus
} from "../storage/repositories/jobRepository";
import { type Runner, updateRunnerHeartbeat } from "../storage/repositories/runnerRepository";

import { reportDslStep as reportRecipeJobDslStep } from "./recipeJobs/reportDslStep";
import { reportDslStep as reportTrainingRunJobDslStep } from "./trainingRunJobs/reportDslStep";

export interface JobActionResult {
	status: number;
	body: { data: unknown } | { error: string };
}

// halt is deliberately excluded — it's a schema/enum slot for a future Intervention-Requested
// status change, not something a Runner can submit as free text this spec.
export type ReportStepBody =
	| { kind: "status"; status: JobStatus; message: string }
	| { kind: "info"; message: string }
	// Both Recipe and Training Run Jobs report DSL Steps by string id (R004/C004 — Training issues
	// real atomic DSL Steps, not a bespoke sequence-based shape). extractions still carries the raw
	// value on the wire (upsertJobResult needs it to compute a safe value) — it's the transcript
	// row built from this that only ever keeps the destination field name. credentialNames is
	// Training-only and names only, never values — the Runner's only chance to tell Hub what
	// `{ref:"credential"}` names its own RUNNER_CREDENTIAL_* env vars make available, since Hub has
	// no other way to learn them ahead of a next-Step prompt.
	| {
			kind: "dslStep";
			stepId: string;
			outcome: "succeeded" | "failed";
			parentStepId?: string;
			extractions: Array<{ fieldName: string; value: string }>;
			credentialNames?: string[];
	  }
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
		case "dslStep": {
			if (typeof body.stepId !== "string" || body.stepId.trim() === "") {
				return { ok: false, error: "stepId is required" };
			}
			if (body.outcome !== "succeeded" && body.outcome !== "failed") {
				return { ok: false, error: "outcome must be 'succeeded' or 'failed'" };
			}
			if (body.parentStepId !== undefined && typeof body.parentStepId !== "string") {
				return { ok: false, error: "parentStepId must be a string" };
			}
			const extractions = body.extractions ?? [];
			if (
				!Array.isArray(extractions) ||
				!extractions.every(
					(value): value is { fieldName: string; value: string } =>
						isRecord(value) && typeof value.fieldName === "string" && typeof value.value === "string"
				)
			) {
				return { ok: false, error: "extractions must be an array of { fieldName, value }" };
			}
			if (
				body.credentialNames !== undefined &&
				(!Array.isArray(body.credentialNames) ||
					!body.credentialNames.every((value): value is string => typeof value === "string" && value.trim() !== ""))
			) {
				return { ok: false, error: "credentialNames must be an array of non-empty strings" };
			}
			return {
				ok: true,
				value: {
					kind: "dslStep",
					stepId: body.stepId,
					outcome: body.outcome,
					...(body.parentStepId !== undefined ? { parentStepId: body.parentStepId } : {}),
					extractions,
					...(body.credentialNames !== undefined ? { credentialNames: body.credentialNames as string[] } : {})
				}
			};
		}
		default:
			return { ok: false, error: `Unrecognized kind: ${body.kind}` };
	}
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
				results: listSafeJobResults(db, job.id),
				ingredients: listSafeJobIngredients(db, job.id),
				artifacts: listJobStepArtifactsForJob(db, job.id).map((artifact) => ({
					id: artifact.id,
					stepId: artifact.stepId,
					createdAt: artifact.createdAt
				}))
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
	if (job.jobType !== JobType.TrainingRun) {
		throw new Error(`Job ${rawId} is not a Training Run Job — Recipe Jobs are not cancellable`);
	}

	const completedAt = new Date();
	updateJobStatus(db, job.id, JobStatus.CompletedCancelled, completedAt);
	appendTranscriptEntry(
		db,
		job.id,
		terminalTranscriptSequence(job.details.maxSteps),
		TranscriptKind.Status,
		"Cancelled by operator",
		completedAt,
		JobStatus.CompletedCancelled
	);

	return { status: 200, body: { data: getJobById(db, job.id) } };
}

// Serves the image the Runner already masked before upload — same "the endpoint only ever
// hands back the safe representation" spirit as job_result, but here there's no separate raw copy at all.
export function getJobStepArtifactImage(db: Database.Database, rawJobId: string, rawArtifactId: string): { image: Buffer } | undefined {
	const jobId = Number(rawJobId);
	const artifactId = Number(rawArtifactId);
	if (Number.isNaN(jobId) || Number.isNaN(artifactId)) {
		return undefined;
	}

	const artifact = getJobStepArtifactById(db, artifactId);
	if (!artifact || artifact.jobId !== jobId) {
		return undefined;
	}

	return { image: readJobStepArtifact(artifact.filePath) };
}

// Claims the oldest Pending Job for this Runner's Registered Application and records the
// "picked up" transcript entry in one place — the outer poll handler (runner/) only needs to know
// whether it got a Job back, never the claim/transcript mechanics.
export function claimJobForRunner(db: Database.Database, runner: Runner, now: Date): Job | undefined {
	const job = claimNextJobForRunner(db, runner.customerApplicationXrefId, runner.id, now);
	if (!job) {
		return undefined;
	}

	appendTranscriptEntry(db, job.id, JOB_CLAIMED_SEQUENCE, TranscriptKind.Status, `Picked up by Runner ${runner.id}`, now, JobStatus.Running);
	return job;
}

export interface UploadJobStepArtifactResult {
	status: number;
	body: { data: { id: number } } | { error: string };
}

// Persists the Runner-masked screenshot bytes via artifactStorage, then records where they
// landed — the DB never stores the image itself, mirroring the design's storage/metadata split.
// Takes an already-ownership-checked Job (runner/ resolves and validates the Runner/Job pairing
// before calling in) — this only ever deals with data it's already been told is valid.
export function uploadJobStepArtifact(db: Database.Database, job: Job, body: unknown): UploadJobStepArtifactResult {
	if (!isRecord(body) || typeof body.stepId !== "string" || body.stepId.trim() === "" || typeof body.imageBase64 !== "string") {
		return { status: 400, body: { error: "stepId and imageBase64 are required" } };
	}

	const registeredApplication = getRegisteredApplicationById(db, job.customerApplicationXrefId);
	if (!registeredApplication) {
		throw new Error(`Job ${job.id}'s customer_application_xref ${job.customerApplicationXrefId} does not exist`);
	}

	const image = Buffer.from(body.imageBase64, "base64");
	const filePath = writeJobStepArtifact(registeredApplication.customerId, job.id, body.stepId, image);
	const artifact = insertJobStepArtifact(db, job.id, body.stepId, filePath, new Date());

	return { status: 201, body: { data: { id: artifact.id } } };
}

// Reports the outcome of a Step and, for Training Run, returns the next LLM-generated Step or the
// terminal status in the same call (C004); an already-terminal Job is returned as-is, unmutated.
// Takes an already-ownership-checked Job/Runner — see uploadJobStepArtifact's note above.
export async function reportJobStep(db: Database.Database, job: Job, runnerId: number, body: unknown): Promise<JobActionResult> {
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
		updateRunnerHeartbeat(db, runnerId, now);
		return { status: 200, body: { data: { jobStatusId: parsed.value.status } } };
	}

	if (parsed.value.kind === "dslStep") {
		return job.jobType === JobType.Recipe
			? reportRecipeJobDslStep(db, job, runnerId, parsed.value, now)
			: reportTrainingRunJobDslStep(db, job, runnerId, parsed.value, now);
	}

	appendAutoSequencedTranscriptEntry(db, job.id, NON_STEP_TRANSCRIPT_KIND[parsed.value.kind], parsed.value.message, now);
	updateJobHeartbeat(db, job.id, now);
	updateRunnerHeartbeat(db, runnerId, now);
	return { status: 200, body: { data: { jobStatusId: job.jobStatusId } } };
}
