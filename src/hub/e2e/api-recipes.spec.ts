import { expect, test } from "@playwright/test";

test("GET /api/hub/registered-applications/[id]/recipes returns a data envelope listing the seeded application's Recipes", async ({
	request
}) => {
	const list = await (await request.get("/api/hub/registered-applications")).json();
	const registeredApplication = list.data.find(
		(item: { applicationName: string }) => item.applicationName === "BambooInvoice"
	);

	const response = await request.get(`/api/hub/registered-applications/${registeredApplication.id}/recipes`);

	expect(response.status()).toBe(200);
	const body = await response.json();
	expect(Array.isArray(body.data)).toBe(true);
});

test("GET /api/hub/registered-applications/[id]/recipes returns an error envelope for an unknown id", async ({ request }) => {
	const response = await request.get("/api/hub/registered-applications/999999/recipes");

	expect(response.status()).toBe(404);
	const body = await response.json();
	expect(body).toEqual({ error: "Registered Application 999999 not found" });
});
