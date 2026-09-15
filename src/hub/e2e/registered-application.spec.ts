import { expect, test } from "@playwright/test";

test("registered applications list links to the seeded registered application", async ({ page }) => {
	await page.goto("/registered-applications");

	await expect(page.getByRole("link", { name: /Widgets/ })).toBeVisible();
});

test("registered application page lists its runner, heartbeat, and a start-training action", async ({
	page
}) => {
	await page.goto("/registered-applications");
	await page.getByRole("link", { name: /Widgets/ }).click();

	await expect(page.getByText(/Runner \d+/)).toBeVisible();
	await expect(page.getByText(/last heartbeat/i)).toBeVisible();
	await expect(page.getByRole("button", { name: "Begin a Training Run" })).toBeVisible();
});

test("registered application page shows a runner as idle before init and alive after", async ({ page, request }) => {
	const list = await (await request.get("/api/hub/registered-applications")).json();
	const registeredApplication = list.data.find((item: { applicationName: string }) => item.applicationName === "Widgets");
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
