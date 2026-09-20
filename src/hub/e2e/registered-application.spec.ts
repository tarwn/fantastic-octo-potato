import { type APIRequestContext, expect, test } from "@playwright/test";

import { seedRecipe } from "./_helpers/hubDb.ts";

test("registered applications list links to the seeded registered application", async ({ page }) => {
	await page.goto("/registered-applications");

	await expect(page.getByRole("link", { name: /BambooInvoice/ })).toBeVisible();
});

test("registered application page lists its runner, heartbeat, and a start-training action", async ({
	page
}) => {
	await page.goto("/registered-applications");
	await page.getByRole("link", { name: /BambooInvoice/ }).click();

	await expect(page.getByText(/Runner \d+/)).toBeVisible();
	await expect(page.getByText(/last heartbeat/i)).toBeVisible();
	await expect(page.getByRole("button", { name: "Begin a Training Run" })).toBeVisible();
});

test("registered application page shows a runner as idle before init and alive after", async ({ page, request }) => {
	const list = await (await request.get("/api/hub/registered-applications")).json();
	const registeredApplication = list.data.find((item: { applicationName: string }) => item.applicationName === "BambooInvoice");
	const detail = await (await request.get(`/api/hub/registered-applications/${registeredApplication.id}`)).json();
	const runnerId = detail.data.runners[0].id;

	await page.goto(`/registered-applications/${registeredApplication.id}`);

	await expect(page.getByText("Idle")).toBeVisible();

	const initResponse = await request.post(`/api/runner/runners/${runnerId}/init`, {
		headers: { authorization: "Bearer change-me" }
	});
	expect(initResponse.status()).toBe(200);

	await page.reload();

	await expect(page.getByText("Alive")).toBeVisible();
});

async function registeredApplicationId(request: APIRequestContext): Promise<number> {
	const list = await (await request.get("/api/hub/registered-applications")).json();
	return list.data.find((item: { applicationName: string }) => item.applicationName === "BambooInvoice").id;
}

test("an unqualified draft Recipe shows Publish disabled on the panel and the review screen", async ({ page, request }) => {
	const applicationId = await registeredApplicationId(request);
	const recipe = seedRecipe("E2E unqualified draft", { trial: "failed" });

	await page.goto(`/registered-applications/${applicationId}`);
	const row = page.locator(".panel-row").filter({ hasText: "E2E unqualified draft" });
	await expect(row.getByText("Not yet qualified")).toBeVisible();
	await expect(row.getByRole("button", { name: "Publish" })).toBeDisabled();

	await page.goto(`/registered-applications/${applicationId}/recipes/${recipe.id}`);
	await expect(page.getByText("Not yet qualified")).toBeVisible();
	await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();
});

test("a qualified draft Recipe publishes and replaces a published one, which leaves the Start Job list", async ({ page, request }) => {
	const applicationId = await registeredApplicationId(request);
	const replaced = seedRecipe("E2E live recipe", { published: true });
	const draft = seedRecipe("E2E next recipe", { trial: "passed" });

	await page.goto(`/registered-applications/${applicationId}`);
	const draftRow = page.locator(".panel-row").filter({ hasText: "E2E next recipe" });
	await expect(draftRow.getByRole("link", { name: "Trial passed" })).toHaveAttribute("href", `/jobs/${draft.trialJobId}`);
	await draftRow.getByRole("button", { name: "Publish" }).click();

	const publishDialog = page.getByRole("dialog");
	await publishDialog.getByLabel("Replaces").selectOption({ label: "E2E live recipe" });
	await expect(publishDialog.getByLabel("Name")).toHaveValue("E2E live recipe");
	await publishDialog.getByRole("button", { name: "Publish" }).click();

	await expect(page.getByText("E2E next recipe")).toHaveCount(0);
	await expect(page.getByRole("link", { name: "E2E live recipe" })).toHaveCount(1);

	await page.getByRole("button", { name: "Start Job" }).first().click();
	await expect(page.getByRole("dialog").getByRole("option", { name: "E2E live recipe" })).toHaveCount(1);

	await page.goto(`/registered-applications/${applicationId}/recipes/${replaced.id}`);
	await expect(page.getByText("Archived")).toBeVisible();
});
