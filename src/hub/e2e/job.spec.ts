import { expect, test } from "@playwright/test";

test("execute-mode job shows title, actions, strip, transcript, and results", async ({ page }) => {
	await page.goto("/jobs/job_8f41c9");

	await expect(page.getByRole("heading", { name: "Statement Extract — March" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Export JSON" })).toBeVisible();

	// status/detail strip: status, recipe, target application, customer
	// exact match to avoid strict-mode collisions with the transcript's uppercase status-change badges
	await expect(page.getByText("Intervention-Requested", { exact: true })).toBeVisible();
	await expect(page.getByText("v4.2")).toBeVisible();
	await expect(page.getByText("Legacy Teller Portal")).toBeVisible();
	await expect(page.getByText("Northwind Financial")).toBeVisible();

	// stage (steps + timing block)
	await expect(page.getByText("Step 14 of 19")).toBeVisible();

	// transcript
	await expect(page.getByText("job created, queued for runner pool")).toBeVisible();
	await expect(page.getByText("picked up by runner rnr-nw-02")).toBeVisible();
	await expect(page.getByText("no recoverable scenario matched")).toBeVisible();

	// results — closing_balance/48,120.55 also appear in the transcript's extract line by design,
	// so .first() asserts presence without depending on final panel markup
	await expect(page.getByText("statement_period")).toBeVisible();
	await expect(page.getByText("2026-03")).toBeVisible();
	await expect(page.getByText("closing_balance").first()).toBeVisible();
	await expect(page.getByText("48,120.55").first()).toBeVisible();
	await expect(page.getByText("account_no")).toBeVisible();
	await expect(page.getByText("txn_count")).toBeVisible();
});

test("training-mode job shows title, actions, strip, transcript, results, and goals", async ({ page }) => {
	await page.goto("/jobs/job_7c0b31");

	await expect(page.getByRole("heading", { name: "Learn: Statement Extract" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Export JSON" })).toBeVisible();

	// status/detail strip: status, recipe, target application, customer
	// exact match to avoid strict-mode collisions with the transcript's uppercase status-change badges
	await expect(page.getByText("Completed-Success", { exact: true })).toBeVisible();
	await expect(page.getByText("v5.0")).toBeVisible();
	await expect(page.getByText("Legacy Teller Portal")).toBeVisible();
	await expect(page.getByText("Northwind Financial")).toBeVisible();

	// stage (steps + timing block)
	await expect(page.getByText("9 of 9 steps")).toBeVisible();

	// transcript
	await expect(page.getByText("training job created, goals accepted")).toBeVisible();
	await expect(page.getByText("picked up by runner rnr-nw-02")).toBeVisible();

	// results — closing_balance/48,120.55 also appear in the transcript's extract line by design,
	// so .first() asserts presence without depending on final panel markup
	await expect(page.getByText("statement_period")).toBeVisible();
	await expect(page.getByText("2026-03")).toBeVisible();
	await expect(page.getByText("closing_balance").first()).toBeVisible();
	await expect(page.getByText("48,120.55").first()).toBeVisible();
	await expect(page.getByText("account_no")).toBeVisible();
	await expect(page.getByText("txn_count")).toBeVisible();

	// goals panel
	await expect(page.getByRole("heading", { name: "Goals" })).toBeVisible();
	await expect(page.getByText("Extract the monthly statement period")).toBeVisible();
	await expect(page.getByText("teller.northwind.test")).toBeVisible();
});
