import { expect, test } from "@playwright/test";

test("GET /api/hub/registered-applications returns a data envelope listing the seeded registered application", async ({
	request
}) => {
	const response = await request.get("/api/hub/registered-applications");

	expect(response.status()).toBe(200);
	const body = await response.json();
	expect(body.data).toContainEqual(expect.objectContaining({ customerName: "Acme", applicationName: "BambooInvoice" }));
});

test("GET /api/hub/registered-applications/[id] returns the registered application and its runners", async ({
	request
}) => {
	const list = await (await request.get("/api/hub/registered-applications")).json();
	const registeredApplication = list.data.find(
		(item: { applicationName: string }) => item.applicationName === "BambooInvoice"
	);

	const response = await request.get(`/api/hub/registered-applications/${registeredApplication.id}`);

	expect(response.status()).toBe(200);
	const body = await response.json();
	expect(body.data).toEqual({
		id: registeredApplication.id,
		customerName: "Acme",
		applicationName: "BambooInvoice",
		runners: expect.arrayContaining([expect.objectContaining({ lastHeartbeatOn: null })])
	});
});

test("GET /api/hub/registered-applications/[id] returns an error envelope for an unknown id", async ({
	request
}) => {
	const response = await request.get("/api/hub/registered-applications/999999");

	expect(response.status()).toBe(404);
	const body = await response.json();
	expect(body).toEqual({ error: "Registered Application 999999 not found" });
});
