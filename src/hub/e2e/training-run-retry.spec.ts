import { expect, test } from "@playwright/test";

// Polls the shared Runner, so it must sort after registered-application.spec.ts (which asserts Idle before init).
test("Retry Job on a failed Training Run opens the modal pre-filled and submitting navigates to a new Job", async ({
	page,
	request
}) => {
	const registeredApplications = await (await request.get("/api/hub/registered-applications")).json();
	const registeredApplication = registeredApplications.data.find(
		(item: { applicationName: string }) => item.applicationName === "BambooInvoice"
	);
	const createResponse = await request.post("/api/hub/jobs/new/training", {
		data: {
			goal: "Retry me",
			startingUrl: "https://example.com/retry",
			maxSteps: 7,
			registeredApplicationId: registeredApplication.id
		}
	});
	const job = (await createResponse.json()).data;

	const detail = await (await request.get(`/api/hub/registered-applications/${registeredApplication.id}`)).json();
	const runnerId = detail.data.runners[0].id;
	const headers = { authorization: "Bearer change-me" };
	await request.post(`/api/runner/runners/${runnerId}/poll`, { headers });
	await request.post(`/api/runner/runners/${runnerId}/jobs/${job.id}/steps`, {
		headers,
		data: { kind: "status", status: 4, message: "Gave up" }
	});

	try {
		await page.goto(`/jobs/${job.id}`);
		await page.getByRole("button", { name: "Retry Job" }).click();

		const dialog = page.getByRole("dialog");
		await expect(dialog.getByLabel(/primary goal/i)).toHaveValue("Retry me");
		await expect(dialog.getByLabel(/starting url/i)).toHaveValue("https://example.com/retry");
		await expect(dialog.getByLabel(/maximum steps/i)).toHaveValue("7");

		await dialog.getByRole("button", { name: /start/i }).click();
		await page.waitForURL((url) => /\/jobs\/\d+$/.test(url.pathname) && !url.pathname.endsWith(`/jobs/${job.id}`));
	}
	finally {
		// Cancel the new Job (if one was created) so it doesn't linger Pending ahead of other tests' Jobs.
		const newJobId = page.url().match(/\/jobs\/(\d+)$/)?.[1];
		if (newJobId && newJobId !== String(job.id)) {
			await request.post(`/api/hub/jobs/${newJobId}/cancel`);
		}
	}
});
