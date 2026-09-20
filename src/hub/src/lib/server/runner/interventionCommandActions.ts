import type Database from "better-sqlite3";

import { interventionStepId } from "../../interventionCommand";
import { reportDslStep } from "../jobs/recipeJobs/reportDslStep";
import { isRecord } from "../jobs/types";
import { JobStatus } from "../storage/db/jobStatus";
import { JobType } from "../storage/db/jobType";
import { completeInterventionCommand, getInterventionCommand, getPendingInterventionCommand } from "../storage/repositories/interventionCommandRepository";
import { getJobById, type Job } from "../storage/repositories/jobRepository";

import type { RunnerActionResult } from "./runnerActions";
import { findRunner, requireRunnerBearerAuth } from "./runnerAuth";

type RecipeJob = Extract<Job, { jobType: JobType.Recipe }>;

// Auth plus Runner/Job lookup and the ownership check, shared by both Runner-facing command endpoints.
function findAssignedRecipeJob(
	db: Database.Database,
	rawRunnerId: string,
	rawJobId: string,
	authHeader: string | null,
	sharedSecret: string
): { job: RecipeJob; runnerId: number } | RunnerActionResult {
	if (!requireRunnerBearerAuth(authHeader, sharedSecret)) {
		return { status: 401, body: { error: "Unauthorized" } };
	}
	const runner = findRunner(db, rawRunnerId);
	if (!runner) {
		return { status: 404, body: { error: `Runner ${rawRunnerId} not found` } };
	}
	const jobId = Number(rawJobId);
	const job = Number.isNaN(jobId) ? undefined : getJobById(db, jobId);
	if (!job || job.jobType !== JobType.Recipe) {
		return { status: 404, body: { error: `Recipe Job ${rawJobId} not found` } };
	}
	if (job.runnerId !== runner.id) {
		return { status: 403, body: { error: `Runner ${rawRunnerId} is not assigned to Job ${rawJobId}` } };
	}
	return { job, runnerId: runner.id };
}

function isRunnerActionResult(value: { job: RecipeJob; runnerId: number } | RunnerActionResult): value is RunnerActionResult {
	return "status" in value;
}

function toExtraction(rawPayload: string): { fieldName: string; value: string } {
	const { name, value } = JSON.parse(rawPayload) as { name: string; value: string | number | boolean };
	return { fieldName: name, value: String(value) };
}

// The only place a command's raw payload leaves the Hub. Nothing is returned unless the Job is still Interactive-User.
export function getPendingCommand(db: Database.Database, rawRunnerId: string, rawJobId: string, authHeader: string | null, sharedSecret: string): RunnerActionResult {
	const found = findAssignedRecipeJob(db, rawRunnerId, rawJobId, authHeader, sharedSecret);
	if (isRunnerActionResult(found)) {
		return found;
	}

	const command = found.job.jobStatusId === JobStatus.InteractiveUser ? getPendingInterventionCommand(db, found.job.id) : undefined;
	if (!command) {
		return { status: 200, body: { data: null } };
	}
	return {
		status: 200,
		body: { data: { id: command.id, stepId: interventionStepId(command.id), kind: command.kind, payload: JSON.parse(command.rawPayload) as unknown } }
	};
}

// One result per command, accepted only while the Job is still Interactive-User; otherwise 409 and the
// Runner discards it. The Transcript entry is written with the same dslStep path every other Step uses.
export function reportCommandResult(
	db: Database.Database,
	rawRunnerId: string,
	rawJobId: string,
	rawCommandId: string,
	authHeader: string | null,
	sharedSecret: string,
	body: unknown
): RunnerActionResult {
	const found = findAssignedRecipeJob(db, rawRunnerId, rawJobId, authHeader, sharedSecret);
	if (isRunnerActionResult(found)) {
		return found;
	}
	const commandId = Number(rawCommandId);
	if (!Number.isInteger(commandId)) {
		return { status: 404, body: { error: `Command ${rawCommandId} not found` } };
	}
	if (!isRecord(body) || (body.outcome !== "succeeded" && body.outcome !== "failed")) {
		return { status: 400, body: { error: "outcome must be 'succeeded' or 'failed'" } };
	}
	const { outcome, targetDescription } = body;
	if (!isRecord(targetDescription) || typeof targetDescription.component !== "string" || targetDescription.component.trim() === "" || typeof targetDescription.selector !== "string") {
		return { status: 400, body: { error: "targetDescription is required as { component, selector }" } };
	}
	const target = { component: targetDescription.component, selector: targetDescription.selector };

	const { job, runnerId } = found;
	const accepted = db.transaction(() => {
		const command = getInterventionCommand(db, job.id, commandId);
		if (!command || !completeInterventionCommand(db, job.id, commandId)) {
			return false;
		}
		// The assigned value only ever comes from the Hub's own copy, so the Runner's report can't alter what reaches Results.
		const extractions = command.kind === "assign" && outcome === "succeeded" ? [toExtraction(command.rawPayload)] : [];
		reportDslStep(
			db,
			job,
			runnerId,
			{
				kind: "dslStep",
				stepId: interventionStepId(commandId),
				outcome,
				targetDescription: target,
				extractions
			},
			new Date()
		);
		return true;
	})();
	if (!accepted) {
		return { status: 409, body: { error: `Command ${rawCommandId} is not pending on an Interactive-User Job` } };
	}
	return { status: 200, body: { data: { jobStatusId: job.jobStatusId } } };
}
