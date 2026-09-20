import type { expect as playwrightExpect } from "@playwright/test";
import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";

// Shared fixtures/helpers for the spec 0009 Training Run e2e guards (training-run.spec.ts,
// training-run.failures.spec.ts) — split out so neither spec file exceeds the 400-line test-file-size
// guard (docs/context/hub/e2e/conventions.md).
//
// Contract assumed of the not-yet-built LLM client (Step 2) and prompts (Steps 3/4/6), to be
// reconciled against the real implementation as those steps land:
//   - Ingredients extraction (Step 3) replies with a JSON array: [{name,value,type,sensitive}, ...]
//   - Next-Step generation (Step 4) replies with a single atomic ChildStep JSON object (steps-dsl.md)
//   - Recipe compilation (Step 6) replies with a JSON RecipeDefinition object (recipeDefinition.ts)
// In all three cases the "model" response is the raw JSON text in the chat completion's message content.

export const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "..");
export const RUNNER_SHARED_SECRET = "test-e2e-shared-secret";

// The baseline seeded Runner (seed.ts): Acme/BambooInvoice, runner id 1.
export const RUNNER_ID = "1";

export const TARGET_APP_URL = "http://localhost:8089/";
export const INVOICES_LIST_URL = "http://localhost:8089/index.php/invoices";
export const SEEDED_INVOICE_LINK_TEXT = "INV-1001";

// Hub's wire contract carries jobStatusId (numeric), never a status label string — these specs run
// as a separate process/service and can't import Hub's $lib/jobStatus.ts, so this duplicates the
// label lookup (mirrors src/hub/src/lib/jobStatus.ts's JOB_STATUS_LABELS) for readable assertions.
export const JOB_STATUS_LABELS: Record<number, string> = {
	1: "Pending",
	2: "Running",
	3: "Completed-Success",
	4: "Completed-Failed",
	5: "Completed-Cancelled",
	6: "Intervention-Requested",
	7: "Completed-Error",
	8: "Interactive-User"
};

export interface RegisteredApplicationSummary {
	id: number;
	customerName: string;
	applicationName: string;
}

export interface JobDetail {
	id: number;
	jobStatusId: number;
	artifacts: unknown[];
}

export interface RecipeSummary {
	id: number;
	name: string;
	goal: string;
	state: string;
	sourceTrainingRunId: string | null;
	definition: {
		inputs: Record<string, unknown>;
		outputs: Record<string, unknown>;
		steps: unknown[];
	};
}

export function spawnRunner(baseURL: string, output: string[]): ChildProcess {
	// --experimental-transform-types: see runner-startup.spec.ts — runner-web's TS source uses
	// `enum`, which Node's native strip-only TS mode can't run without this flag.
	const runner = spawn(process.execPath, ["--experimental-transform-types", "--watch", "src/runner-web/index.ts"], {
		cwd: WORKSPACE_ROOT,
		env: {
			...process.env,
			HUB_URL: baseURL,
			RUNNER_ID,
			RUNNER_SHARED_SECRET,
			// Matches target-app's seeded login (docs/context/tools/target-app.md) — the training-run's
			// generated login Steps reference these via credential refs, never sent by Hub.
			RUNNER_CREDENTIAL_USERNAME: "admin@targetapp.local",
			RUNNER_CREDENTIAL_PASSWORD: "targetapp-seed-pw"
		}
	});
	runner.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
	runner.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
	runner.on("error", (err) => output.push(`[test] failed to spawn runner-web: ${err.message}`));
	return runner;
}

export async function findBambooInvoiceApp(
	request: import("@playwright/test").APIRequestContext
): Promise<RegisteredApplicationSummary> {
	const registeredApplications = await (await request.get("/api/hub/registered-applications")).json();
	const targetApp = (registeredApplications.data as RegisteredApplicationSummary[]).find(
		(app) => app.applicationName === "BambooInvoice"
	);
	if (!targetApp) {
		throw new Error("seeded BambooInvoice registered application not found");
	}
	return targetApp;
}

export async function pollJobStatus(
	request: import("@playwright/test").APIRequestContext,
	jobId: number,
	expectedLabel: string,
	timeout: number,
	expectFn: typeof playwrightExpect
): Promise<JobDetail> {
	let detail: JobDetail | undefined;
	await expectFn
		.poll(
			async () => {
				const body = (await (await request.get(`/api/hub/jobs/${jobId}`)).json()) as { data: JobDetail };
				detail = body.data;
				return JOB_STATUS_LABELS[body.data.jobStatusId];
			},
			{ timeout }
		)
		.toBe(expectedLabel);
	return detail!;
}

export async function fetchRecipes(
	request: import("@playwright/test").APIRequestContext,
	registeredApplicationId: number
): Promise<RecipeSummary[]> {
	const body = await (await request.get(`/api/hub/registered-applications/${registeredApplicationId}/recipes`)).json();
	return body.data as RecipeSummary[];
}

// The BambooInvoice login + "open the one seeded invoice" walk seed.ts's happyPathDefinition()
// already proves works against the real target app — reused here as the sequence the LLM stub
// hands back one atomic Step at a time, mirroring how Step 4's discovery loop would issue them.
export function loginAndCopyClientNameSteps(): { content: string }[] {
	return [
		{
			content: JSON.stringify({
				id: "login_fill_user",
				action: "fill",
				args: [{ by: "css", value: "#username" }, { ref: "credential", name: "username" }],
				intent: "Enter login email"
			})
		},
		{
			content: JSON.stringify({
				id: "login_fill_pass",
				action: "fill",
				args: [{ by: "css", value: "#password" }, { ref: "credential", name: "password" }],
				intent: "Enter login password"
			})
		},
		{
			content: JSON.stringify({
				id: "login_submit",
				action: "click",
				args: [{ by: "css", value: "#login" }],
				intent: "Submit login"
			})
		},
		{
			content: JSON.stringify({
				id: "open_invoices",
				action: "open",
				args: [INVOICES_LIST_URL],
				intent: "Open the Invoices list"
			})
		},
		{
			content: JSON.stringify({
				id: "open_invoice",
				action: "click",
				args: [{ by: "text", value: SEEDED_INVOICE_LINK_TEXT }],
				intent: "Open the seeded invoice"
			})
		},
		{
			content: JSON.stringify({
				id: "wait_invoice",
				action: "verify",
				args: [{ test: "visible", args: [{ by: "css", value: ".invoiceViewHold" }] }],
				intent: "Wait for invoice details to load"
			})
		},
		{
			content: JSON.stringify({
				id: "copy_client",
				action: "read",
				args: [{ by: "css", value: ".invoiceViewHold h3" }, "text", { ref: "output", name: "clientName" }],
				intent: "Copy the client name"
			})
		},
		{
			content: JSON.stringify({
				id: "train_finish",
				action: "finish",
				args: [null],
				intent: "Confirm the client name was collected"
			})
		}
	];
}

export function ingredientsResponse(): { content: string } {
	return { content: JSON.stringify([{ name: "invoiceNumber", value: "INV-1001", type: "string", sensitive: false }]) };
}

export function compiledRecipeResponse(): { content: string } {
	return {
		content: JSON.stringify({
			schemaVersion: 1,
			inputs: {
				// createTrainingRunJob.ts always seeds a "startingUrl" Ingredient itself (startingUrlInput.ts)
				// — never asked of the goal-ingredients LLM step, but still one of the compiled schema's
				// expected input names (recipeCompilationPrompt.ts: "exactly one entry per name given in inputs").
				startingUrl: { type: "string", description: "Where the Recipe starts", required: true, nullable: false, sensitive: false },
				invoiceNumber: { type: "string", description: "Invoice number to look up", required: true, nullable: false, sensitive: false }
			},
			outputs: {
				clientName: { type: "string", description: "Client name on the invoice", required: true, nullable: false, sensitive: false }
			},
			steps: [
				{ id: "start", action: "open", args: [TARGET_APP_URL], intent: "Open BambooInvoice" },
				{
					id: "login_fill_user",
					action: "fill",
					args: [{ by: "css", value: "#username" }, { ref: "credential", name: "username" }],
					intent: "Enter login email"
				},
				{
					id: "login_fill_pass",
					action: "fill",
					args: [{ by: "css", value: "#password" }, { ref: "credential", name: "password" }],
					intent: "Enter login password"
				},
				{ id: "login_submit", action: "click", args: [{ by: "css", value: "#login" }], intent: "Submit login" },
				{ id: "open_invoices", action: "open", args: [INVOICES_LIST_URL], intent: "Open the Invoices list" },
				{
					id: "open_invoice",
					action: "click",
					args: [{ by: "text", value: SEEDED_INVOICE_LINK_TEXT }],
					intent: "Open the seeded invoice"
				},
				{
					id: "wait_invoice",
					action: "verify",
					args: [{ test: "visible", args: [{ by: "css", value: ".invoiceViewHold" }] }],
					intent: "Wait for invoice details to load"
				},
				{
					id: "copy_client",
					action: "read",
					args: [{ by: "css", value: ".invoiceViewHold h3" }, "text", { ref: "output", name: "clientName" }],
					intent: "Copy the client name"
				},
				{
					id: "complete",
					action: "finish",
					args: [{ test: "assigned", args: [{ ref: "output", name: "clientName" }] }],
					intent: "Confirm the client name was collected"
				}
			],
			recoveries: []
		})
	};
}
