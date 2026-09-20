import type Database from "better-sqlite3";

import { JobType } from "../storage/db/jobType";
import { endJobAsOwner, getJobById, type Job, takeJobControl } from "../storage/repositories/jobRepository";

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
