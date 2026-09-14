import { expect, test } from "@playwright/test";

test("jobs list page renders with no jobs", async ({ page }) => {
	await page.goto("/jobs");

	await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
	await expect(page.getByText(/no jobs/i)).toBeVisible();
});
