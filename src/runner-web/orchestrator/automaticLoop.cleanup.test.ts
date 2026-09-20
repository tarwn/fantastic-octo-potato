import { afterEach, describe, expect, it, vi } from "vitest";

import { executeAction } from "../browser/actions.ts";
import { launchBrowserSession } from "../browser/browserSession.ts";
import type { RecipeDefinition, Step } from "../dsl/types.ts";
import type { ClaimedRecipeJob } from "../runnerClient.ts";

import { runRecipeJobLoop } from "./automaticLoop.ts";

vi.mock("../browser/actions.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../browser/actions.ts")>();
	return { ...actual, executeAction: vi.fn(actual.executeAction) };
});

vi.mock("../browser/browserSession.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../browser/browserSession.ts")>();
	return { ...actual, launchBrowserSession: vi.fn(actual.launchBrowserSession) };
});

vi.mock("../runnerClient.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../runnerClient.ts")>();
	return {
		...actual,
		reportDslStep: vi.fn().mockResolvedValue({ jobStatusId: actual.JobStatus.Running }),
		reportStatus: vi.fn().mockResolvedValue({ jobStatusId: actual.JobStatus.Running }),
		reportInfo: vi.fn().mockResolvedValue({ jobStatusId: actual.JobStatus.Running }),
		uploadArtifact: vi.fn().mockResolvedValue({ id: 1 }),
		fetchJobStatus: vi.fn().mockResolvedValue(actual.JobStatus.InterventionRequested)
	};
});

const config = { hubUrl: "http://localhost:4173", runnerId: "1", runnerSharedSecret: "the-secret" };

function openStep(html: string): Extract<Step, { action: "open" }> {
	return { id: "open_fixture", action: "open", args: [`data:text/html,${encodeURIComponent(html)}`] };
}

function buildJob(overrides: Partial<ClaimedRecipeJob> & { recipe: RecipeDefinition }): ClaimedRecipeJob {
	return {
		id: 42,
		mode: "execute",
		recipeId: 1,
		recipeVersion: 1,
		ingredients: {},
		controls: { allowedOrigins: ["data:"] },
		stepTimeoutMs: 5000,
		comms: { statusUrl: "/api/hub/jobs/42", artifactsUrl: "/api/runner/runners/1/jobs/42/artifacts" },
		...overrides
	};
}

afterEach(() => {
	vi.clearAllMocks();
});

// `launchBrowserSession` is spied but wraps the real implementation, so every path below launches a
// real browser/context/page; reading the resolved session back off the spy lets each test assert the
// underlying browser process is actually gone, not just that `closeBrowserSession` was called — this
// is the guard for Step 3 (Temporary resource cleanup) of spec 0008-runner-masking.
describe("runRecipeJobLoop: resource cleanup", () => {
	async function getLaunchedSession() {
		return vi.mocked(launchBrowserSession).mock.results[0].value as ReturnType<typeof launchBrowserSession>;
	}

	it("closes the browser session on Completed-Success", async () => {
		const recipe: RecipeDefinition = {
			schemaVersion: 1,
			inputs: {},
			outputs: {},
			steps: [openStep("<button id=\"go\">Go</button>"), { id: "done", action: "finish", args: [null] }],
			recoveries: []
		};
		const job = buildJob({ recipe });

		await runRecipeJobLoop(config, job, 300);

		const session = await getLaunchedSession();
		expect(session.browser.isConnected()).toBe(false);
	}, 20000);

	it("closes the browser session on Completed-Error (unexpected technical error)", async () => {
		const recipe: RecipeDefinition = {
			schemaVersion: 1,
			inputs: {},
			outputs: {},
			steps: [{ id: "s1", action: "click", args: [{ by: "css", value: "#go" }] }],
			recoveries: []
		};
		const job = buildJob({ recipe });
		vi.mocked(executeAction).mockRejectedValueOnce(new Error("boom"));

		await runRecipeJobLoop(config, job, 300);

		const session = await getLaunchedSession();
		expect(session.browser.isConnected()).toBe(false);
	}, 20000);

	it("closes the browser session on Completed-Error (allowlist violation)", async () => {
		const recipe: RecipeDefinition = {
			schemaVersion: 1,
			inputs: {},
			outputs: {},
			steps: [openStep("<button id=\"go\">Go</button>")],
			recoveries: []
		};
		const job = buildJob({ recipe, controls: { allowedOrigins: ["https://only-this-origin.example.com"] } });

		await runRecipeJobLoop(config, job, 300);

		const session = await getLaunchedSession();
		expect(session.browser.isConnected()).toBe(false);
	}, 20000);

	it("closes the browser session after an Intervention timeout (Completed-Failed)", async () => {
		const recipe: RecipeDefinition = {
			schemaVersion: 1,
			inputs: {},
			outputs: {},
			steps: [openStep("<button id=\"go\">Go</button>"), { id: "click_missing", action: "click", args: [{ by: "css", value: "#does-not-exist" }] }],
			recoveries: []
		};
		const job = buildJob({ recipe });

		await runRecipeJobLoop(config, job, -1);

		const session = await getLaunchedSession();
		expect(session.browser.isConnected()).toBe(false);
	}, 20000);
});
