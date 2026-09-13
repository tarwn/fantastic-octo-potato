import { expect, test } from "@playwright/test";

test("customers list links to the seeded customer", async ({ page }) => {
	await page.goto("/customers");

	await expect(page.getByRole("link", { name: "Northwind Financial" })).toBeVisible();
});

test("customer page shows its name and its registered application", async ({ page }) => {
	await page.goto("/customers");
	await page.getByRole("link", { name: "Northwind Financial" }).click();

	await expect(page.getByRole("heading", { name: "Northwind Financial" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Legacy Teller Portal" })).toBeVisible();
});
