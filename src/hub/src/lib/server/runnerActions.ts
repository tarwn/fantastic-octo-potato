import type Database from "better-sqlite3";

import { JobStatus } from "./db/jobStatus";
import { TranscriptKind } from "./db/jobTranscriptKind";
import { JobType } from "./db/jobType";
import { SensitivityType } from "./db/sensitivityType";
import { getRegisteredApplicationById } from "./repositories/customerApplicationXrefRepository";
import {
	appendAutoSequencedTranscriptEntry,
	appendTranscriptEntry,
	claimNextJobForRunner,
	getJobById,
	getSafeJobIngredientByFieldName,
	insertJobStepArtifact,
	type Job,
	JOB_CLAIMED_SEQUENCE,
	listSensitiveJobIngredients,
	maskValue,
	TERMINAL_JOB_STATUSES,
	terminalTranscriptSequence,
	type TranscriptFieldRef,
	updateJobHeartbeat,
	updateJobStatus,
	upsertJobResult
} from "./repositories/jobRepository";
import { getRecipeById } from "./repositories/recipeRepository";
import { getRunnerById, updateRunnerHeartbeat } from "./repositories/runnerRepository";
import { writeJobStepArtifact } from "./artifactStorage";
import { SCRIPTED_TRAINING_STEPS, type ScriptedTrainingStep } from "./scriptedTrainingSteps";

import type { FieldType } from "$lib/types/recipeDefinition";

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
	// Recipe Jobs report DSL Steps by string id, not a Training-style sequence. extractions still
	// carries the raw value on the wire (upsertJobResult needs it to compute a safe value) — it's
	// the transcript row built from this that only ever keeps the destination field name.
	| { kind: "dslStep"; stepId: string; outcome: "succeeded" | "failed"; parentStepId?: string; extractions: Array<{ fieldName: string; value: string }> }
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
			return {
				ok: true,
				value: {
					kind: "dslStep",
					stepId: body.stepId,
					outcome: body.outcome,
					...(body.parentStepId !== undefined ? { parentStepId: body.parentStepId } : {}),
					extractions
				}
			};
		}
		default:
			return { ok: false, error: `Unrecognized kind: ${body.kind}` };
	}
}

// The Runner has no other way to learn a step's fake-extracted resultField/resultValue (there's
// no real browser automation to derive it from) — it only ever echoes back what this hands it.
function toWireStep(sequence: number, step: ScriptedTrainingStep) {
	return {
		sequence,
		kind: step.kind,
		text: step.text,
		...(step.resultField !== undefined ? { resultField: step.resultField, resultValue: step.resultValue } : {})
	};
}

// Job ingredients are stored as TEXT (raw_value); the Recipe's declared input type says how the
// Runner should actually see the value on the wire. A stored ingredient that doesn't parse as the
// type its own Recipe declares is corrupt data, not a wire-format edge case — crash instead of
// silently sending the Runner a misleading `null` (Number("bogus") is NaN, which JSON.stringify
// turns into null).
function coerceInputValue(fieldName: string, type: FieldType, rawValue: string): string | number | boolean {
	if (type === "number") {
		const parsed = Number(rawValue);
		if (Number.isNaN(parsed)) {
			throw new Error(`Ingredient ${fieldName} is declared type number but stored value "${rawValue}" is not a valid number`);
		}
		return parsed;
	}
	if (type === "boolean") {
		return rawValue === "true";
	}
	return rawValue;
}

// Builds the full runner dispatch payload from the persisted Recipe — replaces the Training
// stand-in's SCRIPTED_TRAINING_STEPS for a Recipe Job.
function buildRecipeJobPayload(db: Database.Database, job: Extract<Job, { jobType: JobType.Recipe }>, runnerId: number) {
	if (job.details.recipeId === null) {
		throw new Error(`Job ${job.id} is a Recipe Job with no recipe_id set`);
	}
	const recipe = getRecipeById(db, job.details.recipeId);
	if (!recipe) {
		throw new Error(`Job ${job.id} references Recipe ${job.details.recipeId}, which no longer exists`);
	}

	const ingredients: Record<string, string | number | boolean> = {};
	for (const ingredient of listSensitiveJobIngredients(db, job.id)) {
		const inputDeclaration = recipe.definition.inputs[ingredient.fieldName];
		if (inputDeclaration) {
			ingredients[ingredient.fieldName] = coerceInputValue(ingredient.fieldName, inputDeclaration.type, ingredient.rawValue);
		}
	}

	return {
		id: job.id,
		mode: job.details.mode,
		recipeId: recipe.id,
		recipeVersion: recipe.version,
		recipe: recipe.definition,
		ingredients,
		controls: { allowedOrigins: [job.details.allowlist] },
		stepTimeoutMs: job.details.stepTimeoutMs,
		// Relative paths only — nothing consumes these yet (Step 4/5 build the Runner-side driver
		// that will call them); an absolute base URL isn't available from this pure-logic layer.
		comms: { statusUrl: `/api/hub/jobs/${job.id}`, artifactsUrl: `/api/runner/runners/${runnerId}/jobs/${job.id}/artifacts` }
	};
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

	appendTranscriptEntry(db, job.id, JOB_CLAIMED_SEQUENCE, TranscriptKind.Status, `Picked up by Runner ${runner.id}`, now, JobStatus.Running);

	const jobId = job.id;
	if (job.jobType === JobType.Recipe) {
		return { status: 200, body: { data: { hasWork: true, job: buildRecipeJobPayload(db, job, runner.id) } } };
	}
	if (job.jobType !== JobType.Training) {
		throw new Error(`Job ${jobId} has an unrecognized job type`);
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
					goal: job.details.goal,
					startingUrl: job.details.startingUrl,
					allowlist: job.details.allowlist,
					maxSteps: job.details.maxSteps,
					nextStep: toWireStep(1, firstStep)
				}
			}
		}
	};
}

function findJob(db: Database.Database, rawJobId: string) {
	const id = Number(rawJobId);
	return Number.isNaN(id) ? undefined : getJobById(db, id);
}

// Transcript rows never carry the raw extracted value — only the destination field name and
// outcome (folded into `message`) plus the already-masked safeValue, same as Training's step rows.
function handleDslStepReport(
	db: Database.Database,
	job: Extract<Job, { jobType: JobType.Recipe }>,
	runnerId: number,
	step: Extract<ReportStepBody, { kind: "dslStep" }>,
	now: Date
): RunnerActionResult {
	if (job.details.recipeId === null) {
		throw new Error(`Job ${job.id} is a Recipe Job with no recipe_id set`);
	}
	const recipe = getRecipeById(db, job.details.recipeId);
	if (!recipe) {
		throw new Error(`Job ${job.id} references Recipe ${job.details.recipeId}, which no longer exists`);
	}

	const outputs: TranscriptFieldRef[] = [];
	for (const extraction of step.extractions) {
		const outputDeclaration = recipe.definition.outputs[extraction.fieldName];
		if (!outputDeclaration) {
			return { status: 400, body: { error: `Unknown output: ${extraction.fieldName}` } };
		}
		const sensitivityType = outputDeclaration.sensitive ? SensitivityType.Other : SensitivityType.None;
		upsertJobResult(db, job.id, extraction.fieldName, extraction.value, sensitivityType, now);
		outputs.push({ fieldName: extraction.fieldName, safeValue: maskValue(extraction.value, sensitivityType), sensitivityType });
	}

	const message = `${step.parentStepId ? `${step.parentStepId} > ` : ""}${step.stepId}: ${step.outcome}`;
	appendAutoSequencedTranscriptEntry(db, job.id, TranscriptKind.Step, { message, inputs: [], outputs }, now);
	updateJobHeartbeat(db, job.id, now);
	updateRunnerHeartbeat(db, runnerId, now);

	return { status: 200, body: { data: { jobStatusId: job.jobStatusId } } };
}

// Persists the Runner-masked screenshot bytes via artifactStorage, then records where they
// landed — the DB never stores the image itself, mirroring the design's storage/metadata split.
export function uploadJobStepArtifact(
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
	if (job.jobType !== JobType.Recipe) {
		return { status: 400, body: { error: "Screenshot artifacts are Recipe Job-only" } };
	}

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

	if (parsed.value.kind === "dslStep") {
		if (job.jobType !== JobType.Recipe) {
			return { status: 400, body: { error: "dslStep reporting is Recipe Job-only" } };
		}
		return handleDslStepReport(db, job, runner.id, parsed.value, now);
	}

	if (parsed.value.kind !== "step") {
		appendAutoSequencedTranscriptEntry(db, job.id, NON_STEP_TRANSCRIPT_KIND[parsed.value.kind], parsed.value.message, now);
		updateJobHeartbeat(db, job.id, now);
		updateRunnerHeartbeat(db, runner.id, now);
		return { status: 200, body: { data: { jobStatusId: job.jobStatusId } } };
	}

	if (job.jobType !== JobType.Training) {
		return { status: 400, body: { error: "step reporting is Training Job-only" } };
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
				nextStep: toWireStep(step.sequence + 1, next)
			}
		}
	};
}
