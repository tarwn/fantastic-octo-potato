import type Database from "better-sqlite3";

import { readJobStepArtifact, writeJobStepArtifact } from "./storage/artifactStorage";
import { getRegisteredApplicationById } from "./storage/customerApplicationXrefRepository";
import {
	appendAutoSequencedTranscriptEntry,
	appendTranscriptEntry,
	claimNextJobForRunner,
	getJobById,
	getLatestJobStepArtifact,
	insertJobStepArtifact,
	insertTrainingJobStep,
	type Job,
	JOB_CLAIMED_SEQUENCE,
	listSafeJobIngredients,
	listSafeJobResults,
	listSensitiveJobIngredients,
	listTrainingJobSteps,
	listTranscriptEntries,
	maskValue,
	TERMINAL_JOB_STATUSES,
	terminalTranscriptSequence,
	type TranscriptFieldRef,
	updateJobHeartbeat,
	updateJobStatus,
	updateTrainingJobCredentialNames,
	upsertJobResult
} from "./storage/jobRepository";
import { JobStatus } from "./storage/jobStatus";
import { TranscriptKind } from "./storage/jobTranscriptKind";
import { JobType } from "./storage/jobType";
import { getRecipeById } from "./storage/recipeRepository";
import { getRunnerById, updateRunnerHeartbeat } from "./storage/runnerRepository";
import { SensitivityType } from "./storage/sensitivityType";
import { deriveNextStep, NextStepInvalidResponseError } from "./nextStep";
import { summarizeTranscriptForLlm } from "./transcriptSummary";

import type { ChildStep, FieldType } from "$lib/types/recipeDefinition";

export interface RunnerActionResult {
	status: number;
	body: { data: unknown } | { error: string };
}

// halt is deliberately excluded — it's a schema/enum slot for a future Intervention-Requested
// status change, not something a Runner can submit as free text this spec.
export type ReportStepBody =
	| { kind: "status"; status: JobStatus; message: string }
	| { kind: "info"; message: string }
	// Both Recipe and Training Jobs report DSL Steps by string id (R004/C004 — Training issues real
	// atomic DSL Steps, not a bespoke sequence-based shape). extractions still carries the raw
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

// Builds the full runner dispatch payload from the persisted Recipe.
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

// The Job's very first Step is fixed, Hub-authored, and already persisted (jobActions.ts, at Job
// creation, per insertTrainingJobStep's "saved before it's handed out" contract) — this just reads
// it back. Every deriveNextStep call happens inside the `steps` handler instead
// (handleTrainingDslStepReport), where a just-uploaded screenshot is always on hand (C004).
function buildTrainingJobPayload(db: Database.Database, job: Extract<Job, { jobType: JobType.Training }>) {
	const [firstStep] = listTrainingJobSteps(db, job.id);
	if (!firstStep) {
		throw new Error(`Training Job ${job.id} has no persisted first Step`);
	}
	return {
		id: job.id,
		goal: job.details.goal,
		alternateGoals: job.details.alternateGoals,
		startingUrl: job.details.startingUrl,
		allowlist: job.details.allowlist,
		maxSteps: job.details.maxSteps,
		stepTimeoutMs: job.details.stepTimeoutMs,
		syntheticDataConfirmed: job.details.syntheticDataConfirmed,
		nextStep: firstStep.definition
	};
}

export function runnerPoll(db: Database.Database, rawId: string, authHeader: string | null, sharedSecret: string): RunnerActionResult {
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

	return { status: 200, body: { data: { hasWork: true, job: buildTrainingJobPayload(db, job) } } };
}

function findJob(db: Database.Database, rawJobId: string) {
	const id = Number(rawJobId);
	return Number.isNaN(id) ? undefined : getJobById(db, id);
}

// Transcript rows never carry the raw extracted value — only the destination field name and
// outcome (folded into `message`) plus the already-masked safeValue.
function handleRecipeDslStepReport(
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

// A Training run has no fixed output schema to validate an extraction's fieldName against (unlike
// Recipe) — real sensitivity classification for an extracted field happens at compile time
// (Step 6), so it's recorded None here.
async function handleTrainingDslStepReport(
	db: Database.Database,
	job: Extract<Job, { jobType: JobType.Training }>,
	runnerId: number,
	step: Extract<ReportStepBody, { kind: "dslStep" }>,
	now: Date
): Promise<RunnerActionResult> {
	const outputs: TranscriptFieldRef[] = step.extractions.map((extraction) => {
		upsertJobResult(db, job.id, extraction.fieldName, extraction.value, SensitivityType.None, now);
		return { fieldName: extraction.fieldName, safeValue: maskValue(extraction.value, SensitivityType.None), sensitivityType: SensitivityType.None };
	});

	// The Runner's only chance to tell Hub what credential names it has — Hub has no other source
	// (they resolve only on the Runner). Overwritten wholesale on whichever report includes it,
	// normally just the first.
	const knownCredentialNames = step.credentialNames ?? job.details.credentialNames;
	if (step.credentialNames !== undefined) {
		updateTrainingJobCredentialNames(db, job.id, step.credentialNames);
	}

	const message = `${step.parentStepId ? `${step.parentStepId} > ` : ""}${step.stepId}: ${step.outcome}`;
	appendAutoSequencedTranscriptEntry(db, job.id, TranscriptKind.Step, { message, inputs: [], outputs }, now);
	updateJobHeartbeat(db, job.id, now);
	updateRunnerHeartbeat(db, runnerId, now);

	// One fetch, reused below for both the maxSteps count and the LLM transcript summary — this
	// table only grows, so a per-report double scan isn't free once a run gets long.
	const transcriptEntries = listTranscriptEntries(db, job.id);

	// Only executable Steps count toward maxSteps (steps-dsl.md) — Training issues atomic Steps
	// only (C003), so every dslStep report here is one such Step.
	const stepsSoFar = transcriptEntries.filter((entry) => entry.kind === TranscriptKind.Step).length;
	if (stepsSoFar >= job.details.maxSteps) {
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

	const artifact = getLatestJobStepArtifact(db, job.id, step.stepId);
	const maskedScreenshotPngBase64 = artifact ? readJobStepArtifact(artifact.filePath).toString("base64") : undefined;
	const knownInputNames = listSafeJobIngredients(db, job.id).map((ingredient) => ingredient.fieldName);
	const knownOutputNames = listSafeJobResults(db, job.id).map((result) => result.fieldName);
	const transcriptSummary = summarizeTranscriptForLlm(transcriptEntries);

	let next: ChildStep;
	try {
		next = await deriveNextStep({
			goal: job.details.goal,
			alternateGoals: job.details.alternateGoals,
			transcriptSummary,
			maskedScreenshotPngBase64,
			knownInputNames,
			knownOutputNames,
			knownCredentialNames
		});
	}
	catch (err) {
		if (!(err instanceof NextStepInvalidResponseError)) {
			throw err;
		}
		updateJobStatus(db, job.id, JobStatus.CompletedError, now);
		appendTranscriptEntry(
			db,
			job.id,
			terminalTranscriptSequence(job.details.maxSteps),
			TranscriptKind.Status,
			`Next-Step generation failed: ${err.message}`,
			now,
			JobStatus.CompletedError
		);
		return { status: 200, body: { data: { jobStatusId: JobStatus.CompletedError } } };
	}

	// validateAtomicStep checks one Step in isolation and has no visibility into ids already used
	// this run — a repeat id would otherwise only surface as training_job_step's UNIQUE constraint
	// throwing after the writes above already committed. Caught here instead, before any of that,
	// and treated the same as an invalid LLM response (steps-dsl.md: "IDs are unique across main
	// steps").
	if (listTrainingJobSteps(db, job.id).some((existing) => existing.stepId === next.id)) {
		updateJobStatus(db, job.id, JobStatus.CompletedError, now);
		appendTranscriptEntry(
			db,
			job.id,
			terminalTranscriptSequence(job.details.maxSteps),
			TranscriptKind.Status,
			`Next-Step generation failed: LLM reused an already-used Step id: ${next.id}`,
			now,
			JobStatus.CompletedError
		);
		return { status: 200, body: { data: { jobStatusId: JobStatus.CompletedError } } };
	}

	// Saved before the Runner ever sees it (insertTrainingJobStep) — the transcript row the
	// Runner later reports for this stepId only ever carries message/outcome, never the action/args
	// a Recipe compiler needs to reconstruct what actually ran.
	insertTrainingJobStep(db, job.id, next, now);

	// An explicit model-issued finish Step ends discovery immediately (R005) — Training's
	// checkpoint may be null (steps-dsl.md), so satisfying it needs no further Runner round-trip.
	if (next.action === "finish") {
		updateJobStatus(db, job.id, JobStatus.CompletedSuccess, now);
		appendTranscriptEntry(
			db,
			job.id,
			terminalTranscriptSequence(job.details.maxSteps),
			TranscriptKind.Status,
			"Model issued a finish Step, marked Completed-Success",
			now,
			JobStatus.CompletedSuccess
		);
		return { status: 200, body: { data: { jobStatusId: JobStatus.CompletedSuccess } } };
	}

	return { status: 200, body: { data: { jobStatusId: JobStatus.Running, nextStep: next } } };
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

// Reports the outcome of a Step and, for Training, returns the next LLM-generated Step or the
// terminal status in the same call (C004); an already-terminal Job is returned as-is, unmutated.
export async function reportJobStep(
	db: Database.Database,
	rawRunnerId: string,
	rawJobId: string,
	authHeader: string | null,
	sharedSecret: string,
	body: unknown
): Promise<RunnerActionResult> {
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
		return job.jobType === JobType.Recipe
			? handleRecipeDslStepReport(db, job, runner.id, parsed.value, now)
			: handleTrainingDslStepReport(db, job, runner.id, parsed.value, now);
	}

	appendAutoSequencedTranscriptEntry(db, job.id, NON_STEP_TRANSCRIPT_KIND[parsed.value.kind], parsed.value.message, now);
	updateJobHeartbeat(db, job.id, now);
	updateRunnerHeartbeat(db, runner.id, now);
	return { status: 200, body: { data: { jobStatusId: job.jobStatusId } } };
}
