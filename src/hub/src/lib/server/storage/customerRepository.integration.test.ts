import { describe, expect, it } from "vitest";

import { useIntegrationTestDb } from "./_test/integrationTestDb";
import { countCustomers, getCustomerById, insertCustomer, listCustomers } from "./customerRepository";

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

	it("lists customers ordered by name", () => {
		insertCustomer(getDb(), "Zeta");
		insertCustomer(getDb(), "Acme");

		expect(listCustomers(getDb())).toEqual([
			{ id: 2, name: "Acme" },
			{ id: 1, name: "Zeta" }
		]);
	});

	it("gets a customer by id", () => {
		const customer = insertCustomer(getDb(), "Acme");

		expect(getCustomerById(getDb(), customer.id)).toEqual(customer);
	});

	it("returns undefined when no customer has the given id", () => {
		expect(getCustomerById(getDb(), 999)).toBeUndefined();
	});
});
