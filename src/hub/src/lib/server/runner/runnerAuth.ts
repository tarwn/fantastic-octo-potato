import type Database from "better-sqlite3";

import { getRunnerById, type Runner } from "../storage/repositories/runnerRepository";

export function requireRunnerBearerAuth(authHeader: string | null, sharedSecret: string): boolean {
	return authHeader === `Bearer ${sharedSecret}`;
}

export function findRunner(db: Database.Database, rawId: string): Runner | undefined {
	const id = Number(rawId);
	return Number.isNaN(id) ? undefined : getRunnerById(db, id);
}
