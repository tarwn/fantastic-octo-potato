import { describe, expect, it } from "vitest";

import { useIntegrationTestDb } from "../db/_test/integrationTestDb";

import { insertCustomerApplicationXref } from "./customerApplicationXrefRepository";

describe("customerApplicationXrefRepository", () => {
	const getDb = useIntegrationTestDb();

	it("inserts a xref row linking a customer and application, returning it with its assigned id", () => {
		const db = getDb();
		db.exec(`
			INSERT INTO customer (id, name) VALUES (1, 'Acme');
			INSERT INTO application (id, name) VALUES (1, 'Widgets');
		`);

		const xref = insertCustomerApplicationXref(db, 1, 1);

		expect(xref).toEqual({ id: 1, customerId: 1, applicationId: 1 });
	});
});
