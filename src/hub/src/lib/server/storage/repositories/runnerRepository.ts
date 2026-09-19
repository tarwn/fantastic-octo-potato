import type Database from "better-sqlite3";

import { fromDbDate, toDbDate } from "../db/dates";

export interface Runner {
	id: number;
	customerApplicationXrefId: number;
	lastHeartbeatOn: Date | null;
}

interface RunnerRow {
	id: number;
	customerApplicationXrefId: number;
	lastHeartbeatOn: string | null;
}

function mapRow(row: RunnerRow): Runner {
	return { ...row, lastHeartbeatOn: fromDbDate(row.lastHeartbeatOn) };
}

export function listRunnersByCustomerApplicationXrefId(
	db: Database.Database,
	customerApplicationXrefId: number
): Runner[] {
	const rows = db
		.prepare(
			"SELECT id, customer_application_xref_id AS customerApplicationXrefId, last_heartbeat_on AS lastHeartbeatOn FROM runner WHERE customer_application_xref_id = ? ORDER BY id"
		)
		.all(customerApplicationXrefId) as RunnerRow[];
	return rows.map(mapRow);
}

export function insertRunner(
	db: Database.Database,
	customerApplicationXrefId: number,
	lastHeartbeatOn: Date | null = null
): Runner {
	const { lastInsertRowid } = db
		.prepare("INSERT INTO runner (customer_application_xref_id, last_heartbeat_on) VALUES (?, ?)")
		.run(customerApplicationXrefId, toDbDate(lastHeartbeatOn));
	return { id: Number(lastInsertRowid), customerApplicationXrefId, lastHeartbeatOn };
}

export function getRunnerById(db: Database.Database, id: number): Runner | undefined {
	const row = db
		.prepare(
			"SELECT id, customer_application_xref_id AS customerApplicationXrefId, last_heartbeat_on AS lastHeartbeatOn FROM runner WHERE id = ?"
		)
		.get(id) as RunnerRow | undefined;
	return row ? mapRow(row) : undefined;
}

export function updateRunnerHeartbeat(db: Database.Database, id: number, when: Date): void {
	db.prepare("UPDATE runner SET last_heartbeat_on = ? WHERE id = ?").run(toDbDate(when), id);
}
