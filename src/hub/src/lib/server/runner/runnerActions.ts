import type Database from "better-sqlite3";

import { claimJobForRunner, reportJobStep as reportJobStepInner, uploadJobStepArtifact as uploadJobStepArtifactInner } from "../jobs/jobActions";
import { JobType } from "../storage/db/jobType";
import { SensitivityType } from "../storage/db/sensitivityType";
import { getJobById, type Job, listSensitiveJobIngredients, listTrainingRunJobSteps } from "../storage/repositories/jobRepository";
import { getRecipeById } from "../storage/repositories/recipeRepository";
import { updateRunnerHeartbeat } from "../storage/repositories/runnerRepository";

import { findRunner, requireRunnerBearerAuth } from "./runnerAuth";

import type { FieldType } from "$lib/types/recipeDefinition";

export interface RunnerActionResult {
	status: number;
	body: { data: unknown } | { error: string };
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
		// Relative paths only — an absolute base URL isn't available from this pure-logic layer.
		comms: { statusUrl: `/api/hub/jobs/${job.id}`, artifactsUrl: `/api/runner/runners/${runnerId}/jobs/${job.id}/artifacts` }
	};
}

// The Job's very first Step is fixed, Hub-authored, and already persisted (jobs/trainingRunJobs,
// at Job creation, per insertTrainingRunJobStep's "saved before it's handed out" contract) — this
// just reads it back. Every deriveNextStep call happens inside jobs/trainingRunJobs's reportDslStep
// instead, where a just-uploaded screenshot is always on hand (C004).
function buildTrainingRunJobPayload(db: Database.Database, job: Extract<Job, { jobType: JobType.TrainingRun }>) {
	const [firstStep] = listTrainingRunJobSteps(db, job.id);
	if (!firstStep) {
		throw new Error(`Training Run Job ${job.id} has no persisted first Step`);
	}

	// Training has no upfront Recipe to declare an input's sensitivity the way buildRecipeJobPayload's
	// recipe.inputs[name].sensitive does — sensitiveIngredientNames carries the same information so
	// the Runner knows which of these raw values to mask in its own screenshots/logs.
	const ingredients: Record<string, string> = {};
	const sensitiveIngredientNames: string[] = [];
	for (const ingredient of listSensitiveJobIngredients(db, job.id)) {
		ingredients[ingredient.fieldName] = ingredient.rawValue;
		if (ingredient.sensitivityType !== SensitivityType.None) {
			sensitiveIngredientNames.push(ingredient.fieldName);
		}
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
		ingredients,
		sensitiveIngredientNames,
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

	const job = claimJobForRunner(db, runner, now);
	if (!job) {
		return { status: 200, body: { data: { hasWork: false } } };
	}

	const jobId = job.id;
	if (job.jobType === JobType.Recipe) {
		return { status: 200, body: { data: { hasWork: true, job: buildRecipeJobPayload(db, job, runner.id) } } };
	}
	if (job.jobType !== JobType.TrainingRun) {
		throw new Error(`Job ${jobId} has an unrecognized job type`);
	}

	return { status: 200, body: { data: { hasWork: true, job: buildTrainingRunJobPayload(db, job) } } };
}

function findJob(db: Database.Database, rawJobId: string): Job | undefined {
	const id = Number(rawJobId);
	return Number.isNaN(id) ? undefined : getJobById(db, id);
}

// Persists the Runner-masked screenshot bytes via jobs/jobActions's uploadJobStepArtifact — this
// layer only ever does auth, Runner/Job lookup, and the ownership check.
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

	return uploadJobStepArtifactInner(db, job, body);
}

// Reports the outcome of a Step and, for Training Run, returns the next LLM-generated Step or the
// terminal status in the same call (C004). This layer only ever does auth, Runner/Job lookup, and
// the ownership check — the report itself (parsing, transcript writes, dslStep dispatch) is
// jobs/jobActions's job.
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

	return reportJobStepInner(db, job, runner.id, body);
}
