import type Database from "better-sqlite3";

import { fromDbDate, toDbDate } from "../db/dates.ts";

export interface Runner {
	id: number;
	customerApplicationXrefId: number;
	lastHeartbeatOn: Date | null;
}

export function listRunnersByCustomerApplicationXrefId(
	db: Database.Database,
	customerApplicationXrefId: number
): Runner[] {
	const rows = db
		.prepare(
			"SELECT id, customer_application_xref_id AS customerApplicationXrefId, last_heartbeat_on AS lastHeartbeatOn FROM runner WHERE customer_application_xref_id = ? ORDER BY id"
		)
		.all(customerApplicationXrefId) as {
		id: number;
		customerApplicationXrefId: number;
		lastHeartbeatOn: string | null;
	}[];
	return rows.map((row) => ({ ...row, lastHeartbeatOn: fromDbDate(row.lastHeartbeatOn) }));
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
