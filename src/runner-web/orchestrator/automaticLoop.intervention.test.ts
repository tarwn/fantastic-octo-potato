import { afterEach, describe, expect, it, vi } from "vitest";

import { launchBrowserSession } from "../browser/browserSession.ts";
import type { RecipeDefinition, Step } from "../dsl/types.ts";
import { type ClaimedRecipeJob, fetchJobStatus, JobStatus, reportStatus } from "../runnerClient.ts";

import { runRecipeJobLoop } from "./automaticLoop.ts";

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
		fetchJobStatus: vi.fn()
	};
});

const config = { hubUrl: "http://localhost:4173", runnerId: "1", runnerSharedSecret: "the-secret" };

const blockedRecipe: RecipeDefinition = {
	schemaVersion: 1,
	inputs: {},
	outputs: {},
	steps: [
		{ id: "open_fixture", action: "open", args: [`data:text/html,${encodeURIComponent("<button id=\"go\">Go</button>")}`] } as Step,
		{ id: "click_missing", action: "click", args: [{ by: "css", value: "#does-not-exist" }] }
	],
	recoveries: []
};

const job: ClaimedRecipeJob = {
	id: 42,
	mode: "execute",
	recipeId: 1,
	recipeVersion: 1,
	recipe: blockedRecipe,
	ingredients: {},
	controls: { allowedOrigins: ["data:"] },
	stepTimeoutMs: 5000,
	comms: { statusUrl: "/api/hub/jobs/42", artifactsUrl: "/api/runner/runners/1/jobs/42/artifacts" }
};

afterEach(() => {
	vi.clearAllMocks();
	vi.mocked(fetchJobStatus).mockReset();
});

async function expectBrowserClosed(): Promise<void> {
	const session = await (vi.mocked(launchBrowserSession).mock.results[0].value as ReturnType<typeof launchBrowserSession>);
	expect(session.browser.isConnected()).toBe(false);
}

describe("runRecipeJobLoop: Intervention wait", () => {
	it("times out to Completed-Failed while no operator takes control", async () => {
		vi.mocked(fetchJobStatus).mockResolvedValue(JobStatus.InterventionRequested);

		await runRecipeJobLoop(config, job, 0.1);

		expect(reportStatus).toHaveBeenLastCalledWith(config, 42, JobStatus.CompletedFailed, "Intervention timed out with no human recovery");
		await expectBrowserClosed();
	}, 20000);

	it("restarts the timeout as an idle timeout once an operator takes control", async () => {
		vi.mocked(fetchJobStatus).mockResolvedValue(JobStatus.InteractiveUser);

		await runRecipeJobLoop(config, job, 0.3);

		// The first poll already lands after the original deadline would have expired, so a second
		// poll proves the takeover restarted the clock instead of failing the Job immediately.
		expect(vi.mocked(fetchJobStatus).mock.calls.length).toBeGreaterThanOrEqual(2);
		expect(reportStatus).toHaveBeenLastCalledWith(config, 42, JobStatus.CompletedFailed, "Interactive session idle timed out");
		await expectBrowserClosed();
	}, 20000);

	it("stops without reporting when Hub moves the Job to a terminal status (cancelled or ended)", async () => {
		vi.mocked(fetchJobStatus).mockResolvedValue(JobStatus.CompletedCancelled);

		await runRecipeJobLoop(config, job, 300);

		expect(reportStatus).toHaveBeenCalledTimes(1);
		expect(reportStatus).toHaveBeenCalledWith(config, 42, JobStatus.InterventionRequested, expect.any(String), "click_missing");
		await expectBrowserClosed();
	}, 20000);

	it("reports Completed-Error on an unexpected non-terminal status change", async () => {
		vi.mocked(fetchJobStatus).mockResolvedValue(JobStatus.Pending);

		await runRecipeJobLoop(config, job, 300);

		expect(reportStatus).toHaveBeenLastCalledWith(config, 42, JobStatus.CompletedError, `Unexpected status change to ${JobStatus.Pending} during intervention`);
		await expectBrowserClosed();
	}, 20000);
});
