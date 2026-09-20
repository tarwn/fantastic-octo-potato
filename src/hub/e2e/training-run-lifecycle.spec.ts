import { expect, test } from "@playwright/test";

test("a Job created via the Start Training modal goes Pending then Running with a transcript row, refetched without a manual reload", async ({
	page,
	request
}) => {
	await page.goto("/registered-applications");
	await page.getByRole("link", { name: /BambooInvoice/ }).click();
	await page.getByRole("button", { name: "Begin a Training Run" }).click();

	const dialog = page.getByRole("dialog");
	await dialog.getByLabel(/primary goal/i).fill("Extract the invoice total");
	await dialog.getByLabel(/starting url/i).fill("https://example.com/start");
	await dialog.getByLabel(/maximum steps/i).fill("5");
	await dialog.getByRole("button", { name: /start/i }).click();

	await page.waitForURL(/\/jobs\/\d+$/);
	const jobId = page.url().match(/\/jobs\/(\d+)$/)?.[1];
	await expect(page.getByText("Pending", { exact: true }).first()).toBeVisible();

	const registeredApplications = await (await request.get("/api/hub/registered-applications")).json();
	const registeredApplication = registeredApplications.data.find(
		(item: { applicationName: string }) => item.applicationName === "BambooInvoice"
	);
	const detail = await (await request.get(`/api/hub/registered-applications/${registeredApplication.id}`)).json();
	const runnerId = detail.data.runners[0].id;

	const pollResponse = await request.post(`/api/runner/runners/${runnerId}/poll`, {
		headers: { authorization: "Bearer change-me" }
	});
	expect((await pollResponse.json()).data).toEqual(expect.objectContaining({ hasWork: true, job: expect.objectContaining({ id: Number(jobId) }) }));

	const stepResponse = await request.post(`/api/runner/runners/${runnerId}/jobs/${jobId}/steps`, {
		headers: { authorization: "Bearer change-me" },
		data: { kind: "dslStep", stepId: "open_starting_url", outcome: "succeeded", targetDescription: { component: "element", selector: "" }, extractions: [] }
	});
	expect(stepResponse.status()).toBe(200);

	// no page.reload() — the Job detail page's RefreshIndicator drives this refetch on its own.
	await expect(page.getByText("Running", { exact: true }).first()).toBeVisible({ timeout: 8000 });
	await expect(page.getByText("open_starting_url: navigate to URL")).toBeVisible();
});
