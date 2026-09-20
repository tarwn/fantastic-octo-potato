import { type APIRequestContext, type Browser, expect, type Page, test } from "@playwright/test";
import type { ChildProcess } from "node:child_process";

import { fetchRecipes, findBambooInvoiceApp, spawnRunner } from "./training-run-helpers.ts";

// End-to-end guards for spec 0013 Step 1: a blocked Recipe Job shows up in the Hub, one operator
// takes control in the overlay, and the Job ends without leaving the Runner or an owner stuck.
// The seeded "Broken invoice lookup" Recipe is the blocked fixture: its only Step that can fail has
// no recovery, so the Runner keeps its browser session open at Intervention-Requested.

const BLOCKED_RECIPE_NAME = "Broken invoice lookup";
const SEEDED_INVOICE_NUMBER = "INV-1001";
const RUNNER_LOOP_FINISHED = /job \d+: recipe loop finished, resuming polling/;

interface BlockedJob {
	jobId: number;
	registeredApplicationId: number;
	customerId: number;
}

async function createBlockedRecipeJob(request: APIRequestContext): Promise<BlockedJob> {
	const app = await findBambooInvoiceApp(request);
	const recipes = await fetchRecipes(request, app.id);
	const recipe = recipes.find((candidate) => candidate.name === BLOCKED_RECIPE_NAME);
	if (!recipe) {
		throw new Error(`seeded Recipe "${BLOCKED_RECIPE_NAME}" not found`);
	}

	const createResponse = await request.post(`/api/hub/jobs/new/recipes/${recipe.id}`, {
		data: { mode: "Execute", ingredients: { invoiceNumber: SEEDED_INVOICE_NUMBER } }
	});
	expect(createResponse.status()).toBe(201);
	const { data: created } = (await createResponse.json()) as { data: { id: number } };

	const customers = (await (await request.get("/api/hub/customers")).json()) as { data: { id: number; name: string }[] };
	const customer = customers.data.find((candidate) => candidate.name === app.customerName);
	if (!customer) {
		throw new Error(`customer ${app.customerName} not found`);
	}
	return { jobId: created.id, registeredApplicationId: app.id, customerId: customer.id };
}

async function jobStatusOf(request: APIRequestContext, jobId: number): Promise<number> {
	const body = (await (await request.get(`/api/hub/jobs/${jobId}`)).json()) as { data: { jobStatusId: number } };
	return body.data.jobStatusId;
}

// A separate browser context has separate browser storage, hence a separate operatorId.
async function openJobAsNewOperator(browser: Browser, baseURL: string, jobId: number): Promise<Page> {
	const context = await browser.newContext({ baseURL });
	const page = await context.newPage();
	await page.goto(`/jobs/${jobId}`);
	return page;
}

test.describe("live human intervention shell (spec 0013 Step 1)", () => {
	test.describe.configure({ timeout: 300_000 });

	let runner: ChildProcess | undefined;
	let runnerOutput: string[] = [];

	test.beforeEach(({ baseURL }) => {
		if (!baseURL) {
			throw new Error("baseURL is not set");
		}
		runnerOutput = [];
	});

	test.afterEach(() => {
		runner?.kill();
		runner = undefined;
	});

	test("a blocked Job is visible everywhere, one operator takes control and ends it, and the Runner returns to polling", async ({
		page,
		request,
		browser,
		baseURL
	}) => {
		const blocked = await createBlockedRecipeJob(request);
		await page.goto(`/jobs/${blocked.jobId}`);
		const secondOperator = await openJobAsNewOperator(browser, baseURL!, blocked.jobId);
		runner = spawnRunner(baseURL!, runnerOutput);

		await expect(page.getByRole("button", { name: "Take Control" })).toBeVisible({ timeout: 60_000 });

		// Every list surface links the blocked Job with its status and (no) owner.
		const otherViews = await browser.newContext({ baseURL });
		const views = await otherViews.newPage();
		await views.goto("/jobs");
		await expect(views.getByText("Intervention-Requested")).toBeVisible();
		await expect(views.getByText("Unowned")).toBeVisible();
		await expect(views.getByRole("link", { name: "Intervene" })).toBeVisible();
		await views.goto(`/registered-applications/${blocked.registeredApplicationId}`);
		await expect(views.getByRole("link", { name: new RegExp(BLOCKED_RECIPE_NAME) })).toBeVisible();
		await expect(views.getByText("Unowned")).toBeVisible();
		await views.goto(`/customers/${blocked.customerId}`);
		await expect(views.getByRole("link", { name: new RegExp(BLOCKED_RECIPE_NAME) })).toBeVisible();
		await otherViews.close();

		// Take Control opens the overlay with the blocked step, reason, transcript, screenshot and owner.
		await page.getByRole("button", { name: "Take Control" }).click();
		const overlay = page.getByRole("dialog");
		await expect(overlay.getByRole("heading", { name: "Human intervention" })).toBeVisible();
		await expect(overlay.getByText(/Blocked at step open_invoice_lookup/)).toBeVisible();
		await expect(overlay.getByText("Owner: you")).toBeVisible();
		await expect(overlay.getByText("Interactive-User")).toBeVisible();
		await expect(overlay.getByRole("list", { name: "Recent transcript" })).toContainText("Control taken by operator");
		await expect(overlay.getByRole("img")).toBeVisible();

		// A second operator's take is rejected, and their overlay is read-only.
		const rejectedTake = await request.post(`/api/hub/jobs/${blocked.jobId}/take-control`, { data: { operatorId: "someone-else" } });
		expect(rejectedTake.status()).toBe(409);
		await secondOperator.getByRole("button", { name: "View control panel" }).click();
		await expect(secondOperator.getByText(/Read-only: this session is controlled by another operator/)).toBeVisible();
		await expect(secondOperator.getByRole("button", { name: "End Job" })).toHaveCount(0);
		const notOwnerEnd = await request.post(`/api/hub/jobs/${blocked.jobId}/end`, { data: { operatorId: "someone-else" } });
		expect(notOwnerEnd.status()).toBe(409);

		// The owner ends the Job: Completed-Failed, overlay closes naming the new status, Runner polls again.
		await overlay.getByRole("button", { name: "End Job" }).click();
		await expect(page.getByRole("dialog")).toHaveCount(0);
		await expect(page.getByText("Job is now Completed-Failed")).toBeVisible();
		await expect.poll(() => jobStatusOf(request, blocked.jobId)).toBe(4);
		await expect(secondOperator.getByRole("dialog")).toHaveCount(0);
		await expect.poll(() => runnerOutput.join("")).toMatch(RUNNER_LOOP_FINISHED);
	});

	test("the owner hands back at a later Step and the Job completes in the same browser session", async ({ page, request, baseURL }) => {
		const blocked = await createBlockedRecipeJob(request);
		await page.goto(`/jobs/${blocked.jobId}`);
		runner = spawnRunner(baseURL!, runnerOutput);

		await page.getByRole("button", { name: "Take Control" }).click({ timeout: 60_000 });
		const overlay = page.getByRole("dialog");
		await expect(overlay.getByTestId("resume-step")).toHaveValue("open_invoice_lookup");

		const nonOwner = await request.post(`/api/hub/jobs/${blocked.jobId}/hand-back`, { data: { operatorId: "someone-else", resumeStepId: "complete" } });
		expect(nonOwner.status()).toBe(409);

		await overlay.getByTestId("resume-step").selectOption("complete");
		await overlay.getByRole("button", { name: "Hand Back" }).click();

		await expect(page.getByRole("dialog")).toHaveCount(0);
		await expect.poll(() => jobStatusOf(request, blocked.jobId), { timeout: 30_000 }).toBe(3);
		const detail = (await (await request.get(`/api/hub/jobs/${blocked.jobId}`)).json()) as {
			data: { interventionOwner: string | null; transcript: { text: unknown }[] };
		};
		expect(detail.data.interventionOwner).toBeNull();
		expect(detail.data.transcript.map((entry) => entry.text)).toContain("Resuming at step complete");
		await expect.poll(() => runnerOutput.join("")).toMatch(RUNNER_LOOP_FINISHED);
	});

	test("handing back at the blocked Step while the blocker persists requests intervention again with the owner cleared", async ({
		page,
		request,
		baseURL
	}) => {
		const blocked = await createBlockedRecipeJob(request);
		await page.goto(`/jobs/${blocked.jobId}`);
		runner = spawnRunner(baseURL!, runnerOutput);

		await page.getByRole("button", { name: "Take Control" }).click({ timeout: 60_000 });
		await page.getByRole("dialog").getByRole("button", { name: "Hand Back" }).click();

		await expect(page.getByRole("dialog")).toHaveCount(0);
		await expect(page.getByRole("button", { name: "Take Control" })).toBeVisible({ timeout: 60_000 });
		const detail = (await (await request.get(`/api/hub/jobs/${blocked.jobId}`)).json()) as {
			data: { jobStatusId: number; interventionOwner: string | null; resumeStepId: string | null; transcript: { text: unknown }[] };
		};
		expect(detail.data).toMatchObject({ jobStatusId: 6, interventionOwner: null, resumeStepId: null });
		expect(detail.data.transcript.filter((entry) => typeof entry.text === "string" && entry.text.includes("failed with no matching recoverable scenario"))).toHaveLength(2);
	});

	test("cancelling a Job under human control closes the overlay and shows the new status", async ({ page, request, baseURL }) => {
		const blocked = await createBlockedRecipeJob(request);
		await page.goto(`/jobs/${blocked.jobId}`);
		runner = spawnRunner(baseURL!, runnerOutput);

		await page.getByRole("button", { name: "Take Control" }).click({ timeout: 60_000 });
		await expect(page.getByRole("dialog").getByText("Owner: you")).toBeVisible();

		const cancelResponse = await request.post(`/api/hub/jobs/${blocked.jobId}/cancel`);
		expect(cancelResponse.status()).toBe(200);

		await expect(page.getByRole("dialog")).toHaveCount(0);
		await expect(page.getByText("Job is now Completed-Cancelled")).toBeVisible();
		await expect.poll(() => runnerOutput.join(""), { timeout: 30_000 }).toMatch(RUNNER_LOOP_FINISHED);
	});

	test("an idle owner times out to Completed-Failed, closing the overlay and returning the Runner to polling", async ({
		page,
		request,
		baseURL
	}) => {
		const blocked = await createBlockedRecipeJob(request);
		await page.goto(`/jobs/${blocked.jobId}`);
		runner = spawnRunner(baseURL!, runnerOutput);

		await page.getByRole("button", { name: "Take Control" }).click({ timeout: 60_000 });
		await expect(page.getByRole("dialog").getByText("Owner: you")).toBeVisible();

		// RUNNER_INTERVENTION_TIMEOUT_SECONDS=20 (playwright.config.ts) restarts as an idle timeout at takeover.
		await expect(page.getByText("Job is now Completed-Failed")).toBeVisible({ timeout: 45_000 });
		await expect(page.getByRole("dialog")).toHaveCount(0);
		const detail = (await (await request.get(`/api/hub/jobs/${blocked.jobId}`)).json()) as {
			data: { interventionOwner: string | null; transcript: { text: unknown }[] };
		};
		expect(detail.data.interventionOwner).toBeNull();
		expect(detail.data.transcript.map((entry) => entry.text)).toContain("Interactive session idle timed out");
		await expect.poll(() => runnerOutput.join("")).toMatch(RUNNER_LOOP_FINISHED);
	});
});
