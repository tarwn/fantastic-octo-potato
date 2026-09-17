import { expect, test } from "@playwright/test";

test("start training modal shows goal, URL, and max-steps fields with validation on empty submit", async ({
	page
}) => {
	await page.goto("/registered-applications");
	await page.getByRole("link", { name: /BambooInvoice/ }).click();
	await page.getByRole("button", { name: "Begin a Training Run" }).click();

	const dialog = page.getByRole("dialog");
	await expect(dialog.getByLabel(/goal/i)).toBeVisible();
	await expect(dialog.getByLabel(/starting url/i)).toBeVisible();
	await expect(dialog.getByLabel(/maximum steps/i)).toBeVisible();

	await dialog.getByRole("button", { name: /start|begin|submit/i }).click();

	await expect(dialog.getByText(/required/i).first()).toBeVisible();
});
