import { expect, test } from "@playwright/test";

test("GET /api/hub/customers returns a data envelope listing the seeded customer", async ({ request }) => {
	const response = await request.get("/api/hub/customers");

	expect(response.status()).toBe(200);
	const body = await response.json();
	expect(body.data).toContainEqual(expect.objectContaining({ name: "Acme" }));
});

test("GET /api/hub/customers/[id] returns the customer and its registered applications", async ({ request }) => {
	const list = await (await request.get("/api/hub/customers")).json();
	const acme = list.data.find((customer: { name: string }) => customer.name === "Acme");

	const response = await request.get(`/api/hub/customers/${acme.id}`);

	expect(response.status()).toBe(200);
	const body = await response.json();
	expect(body.data).toEqual({
		id: acme.id,
		name: "Acme",
		registeredApplications: expect.arrayContaining([expect.objectContaining({ applicationName: "Widgets" })])
	});
});

test("GET /api/hub/customers/[id] returns an error envelope for an unknown id", async ({ request }) => {
	const response = await request.get("/api/hub/customers/999999");

	expect(response.status()).toBe(404);
	const body = await response.json();
	expect(body).toEqual({ error: "Customer 999999 not found" });
});
