import type Database from "better-sqlite3";

export interface CustomerApplicationXref {
	id: number;
	customerId: number;
	applicationId: number;
}

export function insertCustomerApplicationXref(
	db: Database.Database,
	customerId: number,
	applicationId: number
): CustomerApplicationXref {
	const { lastInsertRowid } = db
		.prepare("INSERT INTO customer_application_xref (customer_id, application_id) VALUES (?, ?)")
		.run(customerId, applicationId);
	return { id: Number(lastInsertRowid), customerId, applicationId };
}
