import { expect, test } from "@playwright/test";

test("jobs list page links to a Job created via the API", async ({ page, request }) => {
	const registeredApplications = await (await request.get("/api/hub/registered-applications")).json();
	const registeredApplication = registeredApplications.data.find(
		(item: { applicationName: string }) => item.applicationName === "BambooInvoice"
	);
	const createResponse = await request.post("/api/hub/jobs/new/training", {
		data: {
			goal: "List page smoke test goal",
			startingUrl: "https://example.com/list-smoke",
			maxSteps: 3,
			registeredApplicationId: registeredApplication.id
		}
	});
	const job = (await createResponse.json()).data;

	await page.goto("/jobs");

	await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
	await expect(page.getByText(`job-ca${registeredApplication.id}-${job.id}`)).toBeVisible();
	const jobLink = page.getByRole("link", { name: new RegExp(`job-ca${registeredApplication.id}-${job.id}\\b`) });
	await expect(jobLink).toContainText("Training Run");
	await expect(page.getByText("Acme — BambooInvoice").first()).toBeVisible();

	// Cancel it so it doesn't linger Pending and get claimed ahead of other tests' Jobs
	// on this shared seeded xref/Runner (see playwright.config.ts's workers: 1 note).
	await request.post(`/api/hub/jobs/${job.id}/cancel`);
});
