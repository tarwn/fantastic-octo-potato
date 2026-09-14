import { expect, test } from "@playwright/test";

test("customers list links to the seeded customer", async ({ page }) => {
	await page.goto("/customers");

	await expect(page.getByRole("link", { name: "Acme" })).toBeVisible();
});

test("customer page shows its name and its registered application", async ({ page }) => {
	await page.goto("/customers");
	await page.getByRole("link", { name: "Acme" }).click();

	await expect(page.getByRole("heading", { name: "Acme" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Widgets" })).toBeVisible();
});
