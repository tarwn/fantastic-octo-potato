import type Database from "better-sqlite3";

import { collectResumableStepIds } from "../../recipeStepIds";
import type { ChildStep, FieldDeclaration } from "../../types/recipeDefinition";
import { NextStepInvalidResponseError } from "../llm/nextStep";
import { JobStatus } from "../storage/db/jobStatus";
import { JobType } from "../storage/db/jobType";
import { SensitivityType } from "../storage/db/sensitivityType";
import { getInterventionCommandByKey, insertInterventionCommand, type InterventionCommand, type InterventionCommandKind } from "../storage/repositories/interventionCommandRepository";
import { endJobAsOwner, getJobById, handBackJobAsOwner, type Job, maskValue, takeJobControl } from "../storage/repositories/jobRepository";
import { getRecipeById } from "../storage/repositories/recipeRepository";

import { convertPromptToStep, isCommandAction } from "./interventionPrompt";
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

function parseAssignPayload(declarations: Record<string, FieldDeclaration>, body: Record<string, unknown>): { rawPayload: string; safePayload: string } | string {
	const { name, value } = body;
	if (typeof name !== "string" || typeof value !== "string") {
		return "assign requires a name and a value";
	}
	if (!Object.hasOwn(declarations, name)) {
		return `${name} is not an output declared by this Recipe`;
	}
	const declaration = declarations[name];
	let typedValue: string | number | boolean = value;
	if (declaration.type === "number") {
		typedValue = Number(value);
		if (value.trim() === "" || !Number.isFinite(typedValue)) {
			return `${name} must be a number`;
		}
	}
	else if (declaration.type === "boolean") {
		if (value !== "true" && value !== "false") {
			return `${name} must be true or false`;
		}
		typedValue = value === "true";
	}
	if (declaration.enum && !declaration.enum.includes(value)) {
		return `${name} must be one of: ${declaration.enum.join(", ")}`;
	}
	const safeValue = maskValue(value, declaration.sensitive ? SensitivityType.Other : SensitivityType.None);
	return { rawPayload: JSON.stringify({ name, value: typedValue }), safePayload: JSON.stringify({ name, value: safeValue }) };
}

function buildCommandPayloads(
	db: Database.Database,
	job: Extract<Job, { jobType: JobType.Recipe }>,
	kind: InterventionCommandKind,
	body: Record<string, unknown>
): { rawPayload: string; safePayload: string } | string {
	if (kind === "click") {
		const click = parseClickPayload(body);
		if (click === undefined) {
			return "click requires non-negative numeric x and y";
		}
		const serialized = JSON.stringify(click);
		return { rawPayload: serialized, safePayload: serialized };
	}
	const recipe = job.details.recipeId === null ? undefined : getRecipeById(db, job.details.recipeId);
	if (!recipe) {
		throw new Error(`Job ${job.id} references a Recipe that no longer exists`);
	}
	return parseAssignPayload(recipe.definition.outputs, body);
}

function persistCommand(
	db: Database.Database,
	job: Extract<Job, { jobType: JobType.Recipe }>,
	operatorId: string,
	commandKey: string,
	kind: InterventionCommandKind,
	payloads: { rawPayload: string; safePayload: string }
): JobActionResult {
	const result = insertInterventionCommand(db, { jobId: job.id, operatorId, commandKey, kind, ...payloads, now: new Date() });
	if (!("command" in result)) {
		const errors = {
			busy: `Job ${job.id} already has a command pending`,
			keyReused: "commandKey was already used for a different command",
			notOwner: `Job ${job.id} is not currently owned by this operator`
		};
		return { status: 409, body: { error: errors[result.outcome] } };
	}
	return { status: 200, body: { data: toCommandResponse(result.command) } };
}

function toCommandResponse({ id, commandKey, kind, status, safePayload }: InterventionCommand) {
	return { id, commandKey, kind, status, safePayload: JSON.parse(safePayload) as unknown };
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
	if (body.kind !== "click" && body.kind !== "assign") {
		return { status: 400, body: { error: "kind must be click or assign" } };
	}
	const kind: InterventionCommandKind = body.kind;
	const job = findRecipeJob(db, rawId);
	if (isJobActionResult(job)) {
		return job;
	}
	const payloads = buildCommandPayloads(db, job, kind, body);
	if (typeof payloads === "string") {
		return { status: 400, body: { error: payloads } };
	}

	return persistCommand(db, job, operatorId, body.commandKey, kind, payloads);
}

// The only LLM call in Human Intervention: made after the cheap rejections, and nothing is persisted unless the Step is valid.
export async function submitPromptCommand(db: Database.Database, rawId: string, body: unknown): Promise<JobActionResult> {
	const operatorId = parseOperatorId(body);
	if (operatorId === undefined || !isRecord(body)) {
		return { status: 400, body: { error: "operatorId is required" } };
	}
	if (typeof body.commandKey !== "string" || body.commandKey.trim() === "") {
		return { status: 400, body: { error: "commandKey is required" } };
	}
	if (typeof body.prompt !== "string" || body.prompt.trim() === "") {
		return { status: 400, body: { error: "prompt is required" } };
	}
	const { commandKey, prompt } = body;
	const job = findRecipeJob(db, rawId);
	if (isJobActionResult(job)) {
		return job;
	}

	if (job.jobStatusId !== JobStatus.InteractiveUser || job.interventionOwner !== operatorId) {
		return { status: 409, body: { error: `Job ${rawId} is not currently owned by this operator` } };
	}

	const existing = getInterventionCommandByKey(db, job.id, commandKey);
	if (existing) {
		const samePrompt = existing.kind === "prompt" && (JSON.parse(existing.rawPayload) as { prompt: string }).prompt === prompt;
		return samePrompt ? { status: 200, body: { data: toCommandResponse(existing) } } : { status: 409, body: { error: "commandKey was already used for a different command" } };
	}

	const recipe = job.details.recipeId === null ? undefined : getRecipeById(db, job.details.recipeId);
	if (!recipe) {
		throw new Error(`Job ${job.id} references a Recipe that no longer exists`);
	}
	let step: ChildStep;
	try {
		step = await convertPromptToStep(db, job.id, recipe.definition, prompt);
	}
	catch (err) {
		if (!(err instanceof NextStepInvalidResponseError)) {
			throw err;
		}
		return { status: 422, body: { error: err.message } };
	}
	if (!isCommandAction(step)) {
		return { status: 422, body: { error: `The prompt was converted to a "${step.action}" Step, which can't be run as a command` } };
	}

	// Only the action and intent are safe to show: the Step's literal values can carry what the operator typed.
	const safePayload = JSON.stringify({ action: step.action, intent: step.intent });
	return persistCommand(db, job, operatorId, commandKey, "prompt", { rawPayload: JSON.stringify({ prompt, step }), safePayload });
}
