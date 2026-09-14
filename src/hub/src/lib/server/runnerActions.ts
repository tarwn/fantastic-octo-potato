import type Database from "better-sqlite3";

import { getRunnerById, updateRunnerHeartbeat } from "./repositories/runnerRepository";

export interface RunnerActionResult {
	status: number;
	body: { data: unknown } | { error: string };
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

	updateRunnerHeartbeat(db, runner.id, new Date());

	return { status: 200, body: { data: { hasWork: false } } };
}
