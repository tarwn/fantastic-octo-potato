import type Database from "better-sqlite3";

import { toDbDate } from "../db/dates.ts";
import { JobStatus } from "../db/jobStatus.ts";

export type InterventionCommandKind = "click" | "assign";

export interface InterventionCommand {
	id: number;
	jobId: number;
	commandKey: string;
	kind: InterventionCommandKind;
	rawPayload: string;
	safePayload: string;
	status: "Pending" | "Completed" | "Voided";
}

export type InsertInterventionCommandResult =
	| { outcome: "created" | "duplicate"; command: InterventionCommand }
	| { outcome: "notOwner" | "busy" | "keyReused" };

const COLUMNS = "id, job_id AS jobId, command_key AS commandKey, kind, raw_payload AS rawPayload, safe_payload AS safePayload, status";

// Ownership, the single-pending rule and the idempotency key are all decided in one transaction with
// the write, so a Job that left Interactive-User (or changed owner) between the caller's read and now
// can never receive a command.
export function insertInterventionCommand(
	db: Database.Database,
	params: { jobId: number; operatorId: string; commandKey: string; kind: InterventionCommandKind; rawPayload: string; safePayload: string; now: Date }
): InsertInterventionCommandResult {
	return db.transaction((): InsertInterventionCommandResult => {
		const owned = db
			.prepare("SELECT 1 FROM job WHERE id = ? AND job_status_id = ? AND intervention_owner = ?")
			.get(params.jobId, JobStatus.InteractiveUser, params.operatorId);
		if (!owned) {
			return { outcome: "notOwner" };
		}
		const existing = db.prepare(`SELECT ${COLUMNS} FROM intervention_command WHERE job_id = ? AND command_key = ?`).get(params.jobId, params.commandKey) as InterventionCommand | undefined;
		if (existing) {
			const sameCommand = existing.kind === params.kind && existing.rawPayload === params.rawPayload;
			return sameCommand ? { outcome: "duplicate", command: existing } : { outcome: "keyReused" };
		}
		if (getPendingInterventionCommand(db, params.jobId)) {
			return { outcome: "busy" };
		}
		const { lastInsertRowid } = db
			.prepare("INSERT INTO intervention_command (job_id, command_key, kind, raw_payload, safe_payload, created_at) VALUES (?, ?, ?, ?, ?, ?)")
			.run(params.jobId, params.commandKey, params.kind, params.rawPayload, params.safePayload, toDbDate(params.now));
		const command = db.prepare(`SELECT ${COLUMNS} FROM intervention_command WHERE id = ?`).get(lastInsertRowid) as InterventionCommand;
		return { outcome: "created", command };
	})();
}

export function getInterventionCommand(db: Database.Database, jobId: number, commandId: number): InterventionCommand | undefined {
	return db.prepare(`SELECT ${COLUMNS} FROM intervention_command WHERE id = ? AND job_id = ?`).get(commandId, jobId) as InterventionCommand | undefined;
}

export function getPendingInterventionCommand(db: Database.Database, jobId: number): InterventionCommand | undefined {
	return db.prepare(`SELECT ${COLUMNS} FROM intervention_command WHERE job_id = ? AND status = 'Pending'`).get(jobId) as InterventionCommand | undefined;
}

// Only a still-Pending command on a Job that is still Interactive-User can accept its one result.
export function completeInterventionCommand(db: Database.Database, jobId: number, commandId: number): boolean {
	const { changes } = db
		.prepare(
			"UPDATE intervention_command SET status = 'Completed' WHERE id = ? AND job_id = ? AND status = 'Pending' AND EXISTS (SELECT 1 FROM job WHERE id = ? AND job_status_id = ?)"
		)
		.run(commandId, jobId, jobId, JobStatus.InteractiveUser);
	return changes > 0;
}

export function voidPendingInterventionCommands(db: Database.Database, jobId: number): void {
	db.prepare("UPDATE intervention_command SET status = 'Voided' WHERE job_id = ? AND status = 'Pending'").run(jobId);
}
