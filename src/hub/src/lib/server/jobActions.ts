import type Database from "better-sqlite3";

import { readJobStepArtifact } from "./storage/artifactStorage";
import { getRegisteredApplicationById } from "./storage/customerApplicationXrefRepository";
import {
	appendTranscriptEntry,
	buildOpenStartingUrlStep,
	getJobById,
	getJobStepArtifactById,
	insertJob,
	insertTrainingJobStep,
	JOB_CREATED_SEQUENCE,
	listJobs,
	listJobStepArtifactsForJob,
	listSafeJobIngredients,
	listSafeJobResults,
	listTranscriptEntries,
	STARTING_URL_INGREDIENT_NAME,
	TERMINAL_JOB_STATUSES,
	terminalTranscriptSequence,
	updateJobStatus,
	upsertJobIngredient
} from "./storage/jobRepository";
import { JobStatus } from "./storage/jobStatus";
import { TranscriptKind } from "./storage/jobTranscriptKind";
import { JobType } from "./storage/jobType";
import { SensitivityType } from "./storage/sensitivityType";
import { deriveGoalIngredients, GoalIngredientsInvalidResponseError } from "./goalIngredients";

export interface JobActionResult {
	status: number;
	body: { data: unknown } | { error: string };
}

// One default per Training Job, mirroring recipeActions.ts's RECIPE_JOB_STEP_TIMEOUT_MS — no
// per-Step override exists yet for either Job type.
const TRAINING_JOB_STEP_TIMEOUT_MS = 15_000;

interface CreateJobBody {
	goal?: unknown;
	startingUrl?: unknown;
	maxSteps?: unknown;
	alternateGoals?: unknown;
	syntheticDataConfirmed?: unknown;
}

function deriveAllowlist(startingUrl: string): string | undefined {
	try {
		return new URL(startingUrl).origin;
	}
	catch {
		return undefined;
	}
}

function deriveAlternateGoals(rawAlternateGoals: unknown): string[] {
	if (!Array.isArray(rawAlternateGoals)) {
		return [];
	}
	return rawAlternateGoals
		.filter((entry): entry is string => typeof entry === "string")
		.map((entry) => entry.trim())
		.filter((entry) => entry !== "");
}

export async function createJob(db: Database.Database, rawRegisteredApplicationId: string, body: CreateJobBody): Promise<JobActionResult> {
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

	const alternateGoals = deriveAlternateGoals(body.alternateGoals);
	const syntheticDataConfirmed = body.syntheticDataConfirmed === true;

	// Analyze the goal for probable input values before the Job is persisted — an invalid/
	// exhausted-retry LLM response (GoalIngredientsInvalidResponseError) surfaces as a submit
	// error with no Job created; any other thrown error (e.g. missing LLM config) crashes loudly.
	let ingredients;
	try {
		ingredients = await deriveGoalIngredients(goal);
	}
	catch (err) {
		if (err instanceof GoalIngredientsInvalidResponseError) {
			return { status: 502, body: { error: err.message } };
		}
		throw err;
	}

	const job = db.transaction(() => {
		const inserted = insertJob(db, {
			jobType: JobType.Training,
			customerApplicationXrefId: registeredApplication.id,
			goal,
			startingUrl,
			allowlist,
			maxSteps,
			alternateGoals,
			syntheticDataConfirmed,
			stepTimeoutMs: TRAINING_JOB_STEP_TIMEOUT_MS,
			createdAt: new Date()
		});
		for (const ingredient of ingredients) {
			upsertJobIngredient(
				db,
				inserted.id,
				ingredient.name,
				ingredient.value,
				ingredient.sensitive ? SensitivityType.PII : SensitivityType.None,
				inserted.createdAt
			);
		}
		// Stored as a regular Ingredient (not just training_job.starting_url) so the fixed first
		// Step (below) can reference it the same way a Recipe Job's Steps reference any other
		// declared input — this also prepares Training to run against a test system's URL the same
		// way a later Trial/Execute run would. Upserted last, after the goal-derived Ingredients
		// above, so a same-named ("startingUrl") goal Ingredient can never silently overwrite it.
		upsertJobIngredient(db, inserted.id, STARTING_URL_INGREDIENT_NAME, startingUrl, SensitivityType.None, inserted.createdAt);
		// Persisted now, before any Runner ever claims the Job, per insertTrainingJobStep's
		// contract: a Step is saved before it's handed out, never derived only on the fly.
		insertTrainingJobStep(db, inserted.id, buildOpenStartingUrlStep(), inserted.createdAt);
		return inserted;
	})();

	appendTranscriptEntry(
		db,
		job.id,
		JOB_CREATED_SEQUENCE,
		TranscriptKind.Status,
		"Job created, queued for a Runner",
		job.createdAt,
		JobStatus.Pending
	);

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
	if (job.jobType !== JobType.Training) {
		throw new Error(`Job ${rawId} is not a Training Job — Recipe Jobs are not cancellable`);
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
