import type Database from "better-sqlite3";

import { deriveGoalIngredients, GoalIngredientsInvalidResponseError } from "../../llm/goalIngredients";
import { JobStatus } from "../../storage/db/jobStatus";
import { TranscriptKind } from "../../storage/db/jobTranscriptKind";
import { JobType } from "../../storage/db/jobType";
import { SensitivityType } from "../../storage/db/sensitivityType";
import { getRegisteredApplicationById } from "../../storage/repositories/customerApplicationXrefRepository";
import { appendTranscriptEntry, insertJob, insertTrainingRunJobStep, JOB_CREATED_SEQUENCE, upsertJobIngredient } from "../../storage/repositories/jobRepository";
import { buildOpenStartingUrlStep, STARTING_URL_INGREDIENT_NAME } from "../startingUrlInput";

export interface TrainingRunJobActionResult {
	status: number;
	body: { data: unknown } | { error: string };
}

// One default per Training Run Job, mirroring jobs/recipeJobs's RECIPE_JOB_STEP_TIMEOUT_MS — no
// per-Step override exists yet for either Job type.
const TRAINING_RUN_JOB_STEP_TIMEOUT_MS = 15_000;

interface CreateTrainingRunJobBody {
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

export async function createTrainingRunJob(
	db: Database.Database,
	rawRegisteredApplicationId: string,
	body: CreateTrainingRunJobBody
): Promise<TrainingRunJobActionResult> {
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
			jobType: JobType.TrainingRun,
			customerApplicationXrefId: registeredApplication.id,
			goal,
			startingUrl,
			allowlist,
			maxSteps,
			alternateGoals,
			syntheticDataConfirmed,
			stepTimeoutMs: TRAINING_RUN_JOB_STEP_TIMEOUT_MS,
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
		// Persisted now, before any Runner ever claims the Job, per insertTrainingRunJobStep's
		// contract: a Step is saved before it's handed out, never derived only on the fly.
		insertTrainingRunJobStep(db, inserted.id, buildOpenStartingUrlStep(), inserted.createdAt);
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
