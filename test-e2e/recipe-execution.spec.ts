import { expect, test } from "@playwright/test";
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import path from "node:path";

// Red until Step 6 (Hub UI) lands — see docs/specs/0007-recipe-execution/spec.md, Step 1.
// Steps 2-5 (Recipe storage, real dispatch payload, Playwright driver, Automatic Loop) haven't
// landed yet either, so every call below 404s/fails against the current scripted-step stand-in;
// that's expected per the plan's sequencing note.

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "..");
const TARGET_APP_DIR = path.resolve(WORKSPACE_ROOT, "target-app");
const RUNNER_SHARED_SECRET = "test-e2e-shared-secret";

// The baseline seeded Runner (seed.ts): Acme/Widgets, runner id 1. Step 3 must seed the two
// Recipes below onto a Runner reachable from the same seeded Runner row so this test doesn't
// need its own runner-registration flow (out of scope per spec 0007's traceability).
const RUNNER_ID = "1";

// Names Step 3 must give its two seeded Recipes (R005): one that completes end-to-end against
// the local target application, one that reaches Intervention-Requested/Completed-Failed.
const HAPPY_PATH_RECIPE_NAME = "Read seeded invoice";
const FAILING_RECIPE_NAME = "Broken invoice lookup";

// Seeded target-app data this spec's Recipes read back (docs/context/tools/target-app.md).
const SEEDED_INVOICE_NUMBER = "INV-1001";
const SEEDED_CLIENT_NAME = "Contoso Consulting";

// Hub's wire contract carries jobStatusId (numeric), never a status label string — this test
// runs as a separate process/service and can't import Hub's $lib/jobStatus.ts, so it duplicates
// the label lookup (mirrors src/hub/src/lib/jobStatus.ts's JOB_STATUS_LABELS) for readable
// assertions. Ids 6/7 (Intervention-Requested, Completed-Error) don't exist in that enum yet —
// Step 2 must add them per R008's outcome mapping.
const JOB_STATUS_LABELS: Record<number, string> = {
	1: "Pending",
	2: "Running",
	3: "Completed-Success",
	4: "Completed-Failed",
	5: "Completed-Cancelled",
	6: "Intervention-Requested",
	7: "Completed-Error"
};

interface RecipeSummary {
	id: number;
	name: string;
	state: string;
}

interface JobDetail {
	id: number;
	jobStatusId: number;
	results: { fieldName: string; safeValue: string }[];
}

function spawnRunner(baseURL: string, output: string[]): ChildProcess {
	const runner = spawn(process.execPath, ["--watch", "src/runner-web/index.ts"], {
		cwd: WORKSPACE_ROOT,
		env: {
			...process.env,
			HUB_URL: baseURL,
			RUNNER_ID,
			RUNNER_SHARED_SECRET
		}
	});
	runner.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
	runner.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
	runner.on("error", (err) => output.push(`[test] failed to spawn runner-web: ${err.message}`));
	return runner;
}

async function findRecipe(request: import("@playwright/test").APIRequestContext, name: string): Promise<RecipeSummary> {
	const registeredApplications = await (await request.get("/api/hub/registered-applications")).json();
	const targetApp = (registeredApplications.data as { id: number; applicationName: string }[]).find(
		(app) => app.applicationName === "BambooInvoice"
	);
	if (!targetApp) {
		throw new Error("seeded BambooInvoice registered application not found");
	}

	const recipes = await (await request.get(`/api/hub/registered-applications/${targetApp.id}/recipes`)).json();
	const recipe = (recipes.data as RecipeSummary[]).find((r) => r.name === name);
	if (!recipe) {
		throw new Error(`seeded Recipe "${name}" not found`);
	}
	return recipe;
}

async function pollJobStatus(
	request: import("@playwright/test").APIRequestContext,
	jobId: number,
	expectedLabel: string,
	timeout: number
): Promise<void> {
	await expect
		.poll(
			async () => {
				const body = (await (await request.get(`/api/hub/jobs/${jobId}`)).json()) as { data: JobDetail };
				return JOB_STATUS_LABELS[body.data.jobStatusId];
			},
			{ timeout }
		)
		.toBe(expectedLabel);
}

test.describe("recipe execution against a real target application (spec 0007)", () => {
	// Building the target-app image and initializing MySQL from a cold cache can take several
	// minutes; the default 30s test/hook timeout is nowhere near enough.
	test.describe.configure({ timeout: 300_000 });

	test.beforeAll(() => {
		execFileSync(process.execPath, [path.join(TARGET_APP_DIR, "run-compose.mjs"), "up"], { stdio: "inherit" });
	});

	test.afterAll(() => {
		execFileSync(process.execPath, [path.join(TARGET_APP_DIR, "run-compose.mjs"), "down"], { stdio: "inherit" });
	});

	test("Start Job on the happy-path Recipe reaches Completed-Success with real extracted outputs", async ({
		request,
		baseURL
	}) => {
		if (!baseURL) {
			throw new Error("baseURL is not set");
		}

		const output: string[] = [];
		const runner = spawnRunner(baseURL, output);

		try {
			const recipe = await findRecipe(request, HAPPY_PATH_RECIPE_NAME);

			const createResponse = await request.post(`/api/hub/recipes/${recipe.id}/jobs`, {
				data: { mode: "Execute", ingredients: { invoiceNumber: SEEDED_INVOICE_NUMBER } }
			});
			expect(createResponse.status()).toBe(201);
			const { data: created } = (await createResponse.json()) as { data: { id: number } };

			await pollJobStatus(request, created.id, "Completed-Success", 60_000);

			const jobDetail = (await (await request.get(`/api/hub/jobs/${created.id}`)).json()) as { data: JobDetail };
			expect(jobDetail.data.results).toEqual(
				expect.arrayContaining([expect.objectContaining({ fieldName: "clientName", safeValue: SEEDED_CLIENT_NAME })])
			);
		}
		finally {
			runner.kill();
		}
	});

	test("Start Job on the failing Recipe reaches Intervention-Requested then times out to Completed-Failed", async ({
		request,
		baseURL
	}) => {
		if (!baseURL) {
			throw new Error("baseURL is not set");
		}

		const output: string[] = [];
		const runner = spawnRunner(baseURL, output);

		try {
			const recipe = await findRecipe(request, FAILING_RECIPE_NAME);

			const createResponse = await request.post(`/api/hub/recipes/${recipe.id}/jobs`, {
				data: { mode: "Execute", ingredients: { invoiceNumber: SEEDED_INVOICE_NUMBER } }
			});
			expect(createResponse.status()).toBe(201);
			const { data: created } = (await createResponse.json()) as { data: { id: number } };

			await pollJobStatus(request, created.id, "Intervention-Requested", 60_000);

			// RUNNER_INTERVENTION_TIMEOUT_SECONDS=5 (test-e2e/playwright.config.ts): left unattended,
			// the Runner reports Completed-Failed and exits (R011) well within this poll window.
			await pollJobStatus(request, created.id, "Completed-Failed", 30_000);
		}
		finally {
			runner.kill();
		}
	});
});
