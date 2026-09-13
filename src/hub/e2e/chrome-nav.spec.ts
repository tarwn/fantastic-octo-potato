import { expect, test } from "@playwright/test";

test("chrome nav links to Customers, Registered Applications, and Jobs", async ({ page }) => {
	await page.goto("/");

	await page.getByRole("link", { name: "Customers" }).click();
	await expect(page).toHaveURL(/\/customers$/);

	await page.getByRole("link", { name: "Registered Applications" }).click();
	await expect(page).toHaveURL(/\/registered-applications$/);

	await page.getByRole("link", { name: "Jobs" }).click();
	await expect(page).toHaveURL(/\/jobs$/);
});
