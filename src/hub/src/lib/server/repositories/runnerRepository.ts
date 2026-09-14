import type Database from "better-sqlite3";

import { toDbDate } from "../db/dates.ts";

export interface Runner {
	id: number;
	customerApplicationXrefId: number;
	lastHeartbeatOn: Date | null;
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
