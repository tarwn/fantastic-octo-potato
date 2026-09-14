import { describe, expect, it } from "vitest";

import { useIntegrationTestDb } from "../db/_test/integrationTestDb";

import { countCustomers, insertCustomer } from "./customerRepository";

describe("customerRepository", () => {
	const getDb = useIntegrationTestDb();

	it("counts zero customers in an empty table", () => {
		expect(countCustomers(getDb())).toBe(0);
	});

	it("inserts a customer and returns it with its assigned id", () => {
		const customer = insertCustomer(getDb(), "Acme");

		expect(customer).toEqual({ id: 1, name: "Acme" });
		expect(countCustomers(getDb())).toBe(1);
	});
});
