import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { useIntegrationTestDb } from "../db/_test/integrationTestDb";

import {
	getRegisteredApplicationById,
	insertCustomerApplicationXref,
	listRegisteredApplications,
	listRegisteredApplicationsByCustomerId
} from "./customerApplicationXrefRepository";

function seedCustomerAndApplication(db: Database.Database): void {
	db.exec(`
		INSERT INTO customer (id, name) VALUES (1, 'Acme');
		INSERT INTO application (id, name) VALUES (1, 'Widgets');
	`);
}

describe("customerApplicationXrefRepository", () => {
	const getDb = useIntegrationTestDb();

	it("inserts a xref row linking a customer and application, returning it with its assigned id", () => {
		const db = getDb();
		seedCustomerAndApplication(db);

		const xref = insertCustomerApplicationXref(db, 1, 1);

		expect(xref).toEqual({ id: 1, customerId: 1, applicationId: 1 });
	});

	it("lists registered applications joined with customer and application names", () => {
		const db = getDb();
		seedCustomerAndApplication(db);
		insertCustomerApplicationXref(db, 1, 1);

		expect(listRegisteredApplications(db)).toEqual([
			{ id: 1, customerId: 1, applicationId: 1, customerName: "Acme", applicationName: "Widgets" }
		]);
	});

	it("lists registered applications for a given customer only", () => {
		const db = getDb();
		seedCustomerAndApplication(db);
		db.exec("INSERT INTO customer (id, name) VALUES (2, 'Globex');");
		insertCustomerApplicationXref(db, 1, 1);
		insertCustomerApplicationXref(db, 2, 1);

		expect(listRegisteredApplicationsByCustomerId(db, 2)).toEqual([
			{ id: 2, customerId: 2, applicationId: 1, customerName: "Globex", applicationName: "Widgets" }
		]);
	});

	it("gets a registered application by its xref id", () => {
		const db = getDb();
		seedCustomerAndApplication(db);
		const xref = insertCustomerApplicationXref(db, 1, 1);

		expect(getRegisteredApplicationById(db, xref.id)).toEqual({
			id: 1,
			customerId: 1,
			applicationId: 1,
			customerName: "Acme",
			applicationName: "Widgets"
		});
	});

	it("returns undefined when no registered application has the given id", () => {
		expect(getRegisteredApplicationById(getDb(), 999)).toBeUndefined();
	});
});
