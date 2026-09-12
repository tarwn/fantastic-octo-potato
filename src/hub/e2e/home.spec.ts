import { expect, test } from "@playwright/test";

test("home page renders the status badge test component", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByTestId("status-badge")).toHaveText("Hub status: ready");
});
