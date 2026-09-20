import type Database from "better-sqlite3";

import { collectResumableStepIds } from "../../recipeStepIds";
import { JobType } from "../storage/db/jobType";
import { insertInterventionCommand } from "../storage/repositories/interventionCommandRepository";
import { endJobAsOwner, getJobById, handBackJobAsOwner, type Job, takeJobControl } from "../storage/repositories/jobRepository";
import { getRecipeById } from "../storage/repositories/recipeRepository";

import { isRecord, type JobActionResult } from "./types";

function findRecipeJob(db: Database.Database, rawId: string): Extract<Job, { jobType: JobType.Recipe }> | JobActionResult {
	const id = Number(rawId);
	const job = Number.isNaN(id) ? undefined : getJobById(db, id);
	if (!job) {
		return { status: 404, body: { error: `Job ${rawId} not found` } };
	}
	if (job.jobType !== JobType.Recipe) {
		return { status: 409, body: { error: `Job ${rawId} is not a Recipe Job — only Recipe Jobs can be taken over` } };
	}
	return job;
}

function isJobActionResult(value: Job | JobActionResult): value is JobActionResult {
	return "status" in value;
}

function parseOperatorId(body: unknown): string | undefined {
	return isRecord(body) && typeof body.operatorId === "string" && body.operatorId.trim() !== "" ? body.operatorId : undefined;
}

// The loser of a race (or a caller that arrives after the Job has moved on) gets a 409 and no side effects.
export function takeControl(db: Database.Database, rawId: string, body: unknown): JobActionResult {
	const operatorId = parseOperatorId(body);
	if (operatorId === undefined) {
		return { status: 400, body: { error: "operatorId is required" } };
	}
	const job = findRecipeJob(db, rawId);
	if (isJobActionResult(job)) {
		return job;
	}

	if (!takeJobControl(db, job.id, operatorId, new Date())) {
		return { status: 409, body: { error: `Job ${rawId} is not awaiting intervention or is already owned` } };
	}
	return { status: 200, body: { data: getJobById(db, job.id) } };
}

export function endJob(db: Database.Database, rawId: string, body: unknown): JobActionResult {
	const operatorId = parseOperatorId(body);
	if (operatorId === undefined) {
		return { status: 400, body: { error: "operatorId is required" } };
	}
	const job = findRecipeJob(db, rawId);
	if (isJobActionResult(job)) {
		return job;
	}

	if (!endJobAsOwner(db, job.id, operatorId, new Date())) {
		return { status: 409, body: { error: `Job ${rawId} is not currently owned by this operator` } };
	}
	return { status: 200, body: { data: getJobById(db, job.id) } };
}

// Records the resume position only: the Runner resumes from its status poll, and DSL progression stays Runner-authoritative.
export function handBack(db: Database.Database, rawId: string, body: unknown): JobActionResult {
	const operatorId = parseOperatorId(body);
	if (operatorId === undefined) {
		return { status: 400, body: { error: "operatorId is required" } };
	}
	const resumeStepId = isRecord(body) && typeof body.resumeStepId === "string" ? body.resumeStepId : undefined;
	if (resumeStepId === undefined) {
		return { status: 400, body: { error: "resumeStepId is required" } };
	}
	const job = findRecipeJob(db, rawId);
	if (isJobActionResult(job)) {
		return job;
	}

	const recipe = job.details.recipeId === null ? undefined : getRecipeById(db, job.details.recipeId);
	if (!recipe) {
		throw new Error(`Job ${job.id} references a Recipe that no longer exists`);
	}
	if (!collectResumableStepIds(recipe.definition).includes(resumeStepId)) {
		return { status: 400, body: { error: `Step ${resumeStepId} is not a resume position in this Recipe` } };
	}

	if (!handBackJobAsOwner(db, job.id, operatorId, resumeStepId, new Date())) {
		return { status: 409, body: { error: `Job ${rawId} is not currently owned by this operator` } };
	}
	return { status: 200, body: { data: getJobById(db, job.id) } };
}

function parseClickPayload(body: Record<string, unknown>): { x: number; y: number } | undefined {
	const { x, y } = body;
	return typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 ? { x, y } : undefined;
}

// Validated before anything is persisted for the Runner: invalid input is returned to the overlay
// and creates no command. The response only ever carries the safe form of the command.
export function submitCommand(db: Database.Database, rawId: string, body: unknown): JobActionResult {
	const operatorId = parseOperatorId(body);
	if (operatorId === undefined || !isRecord(body)) {
		return { status: 400, body: { error: "operatorId is required" } };
	}
	if (typeof body.commandKey !== "string" || body.commandKey.trim() === "") {
		return { status: 400, body: { error: "commandKey is required" } };
	}
	if (body.kind !== "click") {
		return { status: 400, body: { error: "kind must be click" } };
	}
	const payload = parseClickPayload(body);
	if (payload === undefined) {
		return { status: 400, body: { error: "click requires non-negative numeric x and y" } };
	}
	const job = findRecipeJob(db, rawId);
	if (isJobActionResult(job)) {
		return job;
	}

	const serialized = JSON.stringify(payload);
	const result = insertInterventionCommand(db, {
		jobId: job.id,
		operatorId,
		commandKey: body.commandKey,
		kind: "click",
		rawPayload: serialized,
		safePayload: serialized,
		now: new Date()
	});
	if (!("command" in result)) {
		const errors = {
			busy: `Job ${rawId} already has a command pending`,
			keyReused: "commandKey was already used for a different command",
			notOwner: `Job ${rawId} is not currently owned by this operator`
		};
		return { status: 409, body: { error: errors[result.outcome] } };
	}
	const { id, commandKey, kind, status, safePayload } = result.command;
	return { status: 200, body: { data: { id, commandKey, kind, status, safePayload: JSON.parse(safePayload) as unknown } } };
}
