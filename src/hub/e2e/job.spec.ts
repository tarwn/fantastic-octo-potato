import { expect, test } from "@playwright/test";

test("Job detail page shows strip, stage, transcript, results, and goals from real data", async ({ page, request }) => {
	const registeredApplications = await (await request.get("/api/hub/registered-applications")).json();
	const registeredApplication = registeredApplications.data.find(
		(item: { applicationName: string }) => item.applicationName === "BambooInvoice"
	);
	const createResponse = await request.post(`/api/hub/registered-applications/${registeredApplication.id}/jobs`, {
		data: { goal: "Extract the closing balance", startingUrl: "https://example.com/detail-smoke", maxSteps: 5 }
	});
	const job = (await createResponse.json()).data;

	await page.goto(`/jobs/${job.id}`);

	await expect(page.getByRole("heading", { name: "Extract the closing balance" })).toBeVisible();
	await expect(page.getByText(`job-ca${registeredApplication.id}-${job.id}`)).toBeVisible();
	await expect(page.getByText("Pending", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("Acme", { exact: true })).toBeVisible();
	await expect(page.getByText("BambooInvoice", { exact: true })).toBeVisible();
	await expect(page.getByText("Step 0 of 5")).toBeVisible();

	await expect(page.getByRole("heading", { name: "Transcript" })).toBeVisible();
	await expect(page.getByText("Job created, queued for a Runner")).toBeVisible();

	await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
	await expect(page.getByText("No results yet.")).toBeVisible();

	await expect(page.getByRole("heading", { name: "Goals" })).toBeVisible();
	await expect(page.getByText("allowlist: https://example.com")).toBeVisible();

	await expect(page.getByRole("button", { name: "Cancel job" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Export JSON" })).toBeVisible();

	// Cancel it so it doesn't linger Pending and get claimed ahead of other tests' Jobs
	// on this shared seeded xref/Runner (see playwright.config.ts's workers: 1 note).
	await request.post(`/api/hub/jobs/${job.id}/cancel`);
});
