import { expect, test } from "@playwright/test";

import { seedRecipe } from "./_helpers/hubDb.ts";

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

test("POST /api/hub/recipes/[id]/publish publishes a qualified draft and returns its summary", async ({ request }) => {
	const recipe = seedRecipe("E2E api publish", { trial: "passed" });

	const response = await request.post(`/api/hub/recipes/${recipe.id}/publish`, { data: { name: "E2E api published" } });

	expect(response.status()).toBe(200);
	const body = await response.json();
	expect(body.data).toEqual(expect.objectContaining({ id: recipe.id, name: "E2E api published", state: "Published", qualifiedByJobId: recipe.trialJobId }));
});

test("POST /api/hub/recipes/[id]/publish rejects an unqualified draft", async ({ request }) => {
	const recipe = seedRecipe("E2E api unqualified");

	const response = await request.post(`/api/hub/recipes/${recipe.id}/publish`, { data: { name: "Nope" } });

	expect(response.status()).toBe(400);
	expect(await response.json()).toEqual({ error: "Recipe has no successful Trial Job" });
});

test("POST /api/hub/recipes/[id]/publish rejects a body that is not a JSON object", async ({ request }) => {
	const response = await request.post("/api/hub/recipes/1/publish", { headers: { "content-type": "application/json" }, data: "not json" });

	expect(response.status()).toBe(400);
	expect(await response.json()).toEqual({ error: "Request body must be a JSON object" });
});
