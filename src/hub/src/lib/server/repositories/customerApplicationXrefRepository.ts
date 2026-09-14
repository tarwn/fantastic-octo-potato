import type Database from "better-sqlite3";

export interface CustomerApplicationXref {
	id: number;
	customerId: number;
	applicationId: number;
}

// A "Registered Application" (per ARCHITECTURE.md) is a customer_application_xref row,
// joined with the customer/application names read APIs and pages need to display it.
export interface RegisteredApplication {
	id: number;
	customerId: number;
	applicationId: number;
	customerName: string;
	applicationName: string;
}

const REGISTERED_APPLICATION_SELECT = `
	SELECT xref.id AS id, xref.customer_id AS customerId, xref.application_id AS applicationId,
	       customer.name AS customerName, application.name AS applicationName
	FROM customer_application_xref AS xref
	JOIN customer ON customer.id = xref.customer_id
	JOIN application ON application.id = xref.application_id
`;

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

export function listRegisteredApplications(db: Database.Database): RegisteredApplication[] {
	return db
		.prepare(`${REGISTERED_APPLICATION_SELECT} ORDER BY customer.name, application.name`)
		.all() as RegisteredApplication[];
}

export function listRegisteredApplicationsByCustomerId(
	db: Database.Database,
	customerId: number
): RegisteredApplication[] {
	return db
		.prepare(`${REGISTERED_APPLICATION_SELECT} WHERE xref.customer_id = ? ORDER BY application.name`)
		.all(customerId) as RegisteredApplication[];
}

export function getRegisteredApplicationById(db: Database.Database, id: number): RegisteredApplication | undefined {
	return db
		.prepare(`${REGISTERED_APPLICATION_SELECT} WHERE xref.id = ?`)
		.get(id) as RegisteredApplication | undefined;
}
