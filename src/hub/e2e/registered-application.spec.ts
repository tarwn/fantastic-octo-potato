import { expect, test } from "@playwright/test";

test("registered applications list links to the seeded registered application", async ({ page }) => {
	await page.goto("/registered-applications");

	await expect(page.getByRole("link", { name: "Legacy Teller Portal" })).toBeVisible();
});

test("registered application page lists its runner, heartbeat, and a start-training action", async ({
	page
}) => {
	await page.goto("/registered-applications");
	await page.getByRole("link", { name: "Legacy Teller Portal" }).click();

	await expect(page.getByText("rnr-nw-02")).toBeVisible();
	await expect(page.getByText(/last heartbeat/i)).toBeVisible();
	await expect(page.getByRole("button", { name: "Begin a Training Run" })).toBeVisible();
});
