import type { Request, Route } from "playwright";
import { afterEach, describe, expect, it, vi } from "vitest";

import { executeAction } from "../browser/actions.ts";
import type { RouteHandler } from "../browser/browserSession.ts";
import { launchBrowserSession } from "../browser/browserSession.ts";
import { takeMaskedScreenshot } from "../browser/screenshotMasking.ts";
import { listAvailableCredentialNames } from "../credentials.ts";
import type { ChildStep } from "../dsl/types.ts";
import { type ClaimedJob, JobStatus, reportDslStep, reportInfo, reportStatus, uploadArtifact } from "../runnerClient.ts";

import { runTrainingJobLoop } from "./trainingLoop.ts";

// Isolates these tests from whatever RUNNER_CREDENTIAL_* env vars happen to be set locally
// (src/runner-web/.env, needed for real Runner use) — credentialNames/secrets are exercised via
// this mock's return value instead of real process.env state.
vi.mock("../credentials.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../credentials.ts")>();
	return { ...actual, listAvailableCredentialNames: vi.fn().mockReturnValue([]) };
});

vi.mock("../browser/actions.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../browser/actions.ts")>();
	return { ...actual, executeAction: vi.fn(actual.executeAction) };
});

vi.mock("../browser/browserSession.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../browser/browserSession.ts")>();
	return { ...actual, launchBrowserSession: vi.fn(actual.launchBrowserSession) };
});

vi.mock("../browser/screenshotMasking.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../browser/screenshotMasking.ts")>();
	return { ...actual, takeMaskedScreenshot: vi.fn(actual.takeMaskedScreenshot) };
});

vi.mock("../runnerClient.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../runnerClient.ts")>();
	return {
		...actual,
		reportDslStep: vi.fn().mockResolvedValue({ jobStatusId: actual.JobStatus.CompletedSuccess }),
		reportStatus: vi.fn().mockResolvedValue({ jobStatusId: actual.JobStatus.Running }),
		reportInfo: vi.fn().mockResolvedValue({ jobStatusId: actual.JobStatus.Running }),
		uploadArtifact: vi.fn().mockResolvedValue({ id: 1 })
	};
});

async function simulateBlockedRequest(url: string, isNavigation: boolean): Promise<void> {
	const handler = vi.mocked(launchBrowserSession).mock.calls[0][0] as RouteHandler;
	const route = { abort: vi.fn().mockResolvedValue(undefined), continue: vi.fn().mockResolvedValue(undefined) } as unknown as Route;
	const request = { url: () => url, isNavigationRequest: () => isNavigation } as unknown as Request;
	await handler(route, request);
}

const realExecuteAction = (await vi.importActual<typeof import("../browser/actions.ts")>("../browser/actions.ts")).executeAction;

const config = { hubUrl: "http://localhost:4173", runnerId: "1", runnerSharedSecret: "the-secret" };

function openStep(html: string): Extract<ChildStep, { action: "open" }> {
	return { id: "open_fixture", action: "open", args: [`data:text/html,${encodeURIComponent(html)}`] };
}

function buildJob(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
	return {
		id: 42,
		goal: "Learn the thing",
		alternateGoals: [],
		startingUrl: "data:text/html,",
		allowlist: "data:",
		maxSteps: 10,
		stepTimeoutMs: 5000,
		syntheticDataConfirmed: false,
		ingredients: {},
		sensitiveIngredientNames: [],
		nextStep: openStep("<button id=\"go\">Go</button>"),
		...overrides
	};
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("runTrainingJobLoop: happy path", () => {
	it("executes each Hub-issued Step, reports+uploads a screenshot per Step and on terminal exit, until Hub returns no nextStep", async () => {
		const job = buildJob();
		vi.mocked(reportDslStep)
			.mockResolvedValueOnce({ jobStatusId: JobStatus.Running, nextStep: { id: "click_go", action: "click", args: [{ by: "css", value: "#go" }] } })
			.mockResolvedValueOnce({ jobStatusId: JobStatus.CompletedSuccess });

		await runTrainingJobLoop(config, job);

		expect(reportDslStep).toHaveBeenNthCalledWith(1, config, 42, { stepId: "open_fixture", outcome: "succeeded", extractions: [], targetDescription: { component: "browser", selector: "" }, credentialNames: [] });
		expect(reportDslStep).toHaveBeenNthCalledWith(2, config, 42, { stepId: "click_go", outcome: "succeeded", extractions: [], targetDescription: { component: "button", selector: "id='go'" }, credentialNames: [] });
		expect(uploadArtifact).toHaveBeenCalledTimes(3); // 2 Steps + 1 terminal-exit screenshot
		expect(uploadArtifact).toHaveBeenNthCalledWith(3, config, "/api/runner/runners/1/jobs/42/artifacts", "terminal", expect.any(String));
		expect(reportStatus).not.toHaveBeenCalled();
	}, 20000);

	it("passes an extraction along with the Step's outcome", async () => {
		const job = buildJob({ nextStep: openStep("<div id=\"secretField\">42</div>") });
		vi.mocked(reportDslStep)
			.mockResolvedValueOnce({
				jobStatusId: JobStatus.Running,
				nextStep: { id: "read_value", action: "read", args: [{ by: "css", value: "#secretField" }, "text", { ref: "output", name: "value" }] }
			})
			.mockResolvedValueOnce({ jobStatusId: JobStatus.CompletedSuccess });

		await runTrainingJobLoop(config, job);

		expect(reportDslStep).toHaveBeenNthCalledWith(2, config, 42, {
			stepId: "read_value",
			outcome: "succeeded",
			extractions: [{ fieldName: "value", value: "42" }],
			targetDescription: expect.anything(),
			credentialNames: []
		});
	}, 20000);

	it("reports every locally-available credential name Hub tells the next-Step prompt about", async () => {
		process.env.RUNNER_CREDENTIAL_PASSWORD = "hunter2";
		vi.mocked(listAvailableCredentialNames).mockReturnValueOnce(["password"]);
		const job = buildJob();
		vi.mocked(reportDslStep).mockResolvedValueOnce({ jobStatusId: JobStatus.CompletedSuccess });

		await runTrainingJobLoop(config, job);

		expect(reportDslStep).toHaveBeenCalledWith(config, 42, expect.objectContaining({ credentialNames: ["password"] }));
		delete process.env.RUNNER_CREDENTIAL_PASSWORD;
	}, 20000);

	it("masks a declared-sensitive Ingredient's value in every screenshot, and skips the third-party PII pass when syntheticDataConfirmed", async () => {
		const job = buildJob({ ingredients: { secretField: "hunter2" }, sensitiveIngredientNames: ["secretField"], syntheticDataConfirmed: true });
		vi.mocked(reportDslStep).mockResolvedValueOnce({ jobStatusId: JobStatus.CompletedSuccess });

		await runTrainingJobLoop(config, job);

		expect(takeMaskedScreenshot).toHaveBeenCalledWith(expect.anything(), ["hunter2"], true);
	}, 20000);
});

describe("runTrainingJobLoop: terminal outcome mapping", () => {
	it("reports Completed-Error on an allowlist violation, without reporting the triggering Step", async () => {
		const job = buildJob({ allowlist: "https://only-this-origin.example.com" });

		await runTrainingJobLoop(config, job);

		expect(reportDslStep).not.toHaveBeenCalled();
		expect(reportStatus).toHaveBeenCalledWith(config, 42, JobStatus.CompletedError, expect.stringContaining("disallowed origin"));
	}, 20000);

	it("reports Completed-Error when the allowlist route handler blocks a navigation request, without reporting the triggering Step", async () => {
		const job = buildJob({ nextStep: openStep("<button id=\"go\">Go</button>") });
		vi.mocked(reportDslStep).mockResolvedValueOnce({
			jobStatusId: JobStatus.Running,
			nextStep: { id: "click_go", action: "click", args: [{ by: "css", value: "#go" }] }
		});
		vi.mocked(executeAction).mockImplementation(async (page, step, ctx) => {
			if (step.id === "click_go") {
				await simulateBlockedRequest("https://blocked.example.net/redirected", true);
			}
			return realExecuteAction(page, step, ctx);
		});

		await runTrainingJobLoop(config, job);

		expect(reportDslStep).not.toHaveBeenCalledWith(config, 42, expect.objectContaining({ stepId: "click_go" }));
		expect(reportStatus).toHaveBeenCalledWith(config, 42, JobStatus.CompletedError, expect.stringContaining("disallowed origin"));
	}, 20000);

	it("reports a blocked subresource request as an INFO row without failing the Step it happened during", async () => {
		const job = buildJob({ nextStep: openStep("<button id=\"go\">Go</button>") });
		vi.mocked(reportDslStep)
			.mockResolvedValueOnce({ jobStatusId: JobStatus.Running, nextStep: { id: "click_go", action: "click", args: [{ by: "css", value: "#go" }] } })
			.mockResolvedValueOnce({ jobStatusId: JobStatus.CompletedSuccess });
		vi.mocked(executeAction).mockImplementation(async (page, step, ctx) => {
			if (step.id === "click_go") {
				await simulateBlockedRequest("https://blocked.example.net/tracker.js", false);
			}
			return realExecuteAction(page, step, ctx);
		});

		await runTrainingJobLoop(config, job);

		expect(reportInfo).toHaveBeenCalledWith(config, 42, "Step click_go: blocked a disallowed-origin request to https://blocked.example.net/tracker.js");
		expect(reportDslStep).toHaveBeenCalledWith(config, 42, { stepId: "click_go", outcome: "succeeded", extractions: [], targetDescription: { component: "button", selector: "id='go'" }, credentialNames: [] });
	}, 20000);

	it("reports a failed Step's outcome, still asking Hub for the next Step (Hub/the LLM decides how to recover)", async () => {
		const job = buildJob({ nextStep: { id: "click_missing", action: "click", args: [{ by: "css", value: "#does-not-exist" }] } });
		vi.mocked(reportDslStep).mockResolvedValueOnce({ jobStatusId: JobStatus.CompletedSuccess });

		await runTrainingJobLoop(config, job);

		expect(reportInfo).toHaveBeenCalledWith(config, 42, expect.stringContaining("Step click_missing failed: TARGET_NOT_FOUND"));
		expect(reportDslStep).toHaveBeenCalledWith(config, 42, { stepId: "click_missing", outcome: "failed", extractions: [], targetDescription: { component: "element", selector: "" }, credentialNames: [] });
	}, 20000);

	it("reports Completed-Error on an unexpected technical error the DSL driver lets propagate", async () => {
		const job = buildJob();
		vi.mocked(executeAction).mockRejectedValueOnce(new Error("boom"));

		await runTrainingJobLoop(config, job);

		expect(reportDslStep).not.toHaveBeenCalled();
		expect(reportStatus).toHaveBeenCalledWith(config, 42, JobStatus.CompletedError, expect.stringContaining("boom"));
	}, 20000);

	it("reports Completed-Error, without ever opening a browser page, when launching the browser session itself fails", async () => {
		const job = buildJob();
		vi.mocked(launchBrowserSession).mockRejectedValueOnce(new Error("no browser binary"));

		await runTrainingJobLoop(config, job);

		expect(executeAction).not.toHaveBeenCalled();
		expect(reportDslStep).not.toHaveBeenCalled();
		expect(uploadArtifact).not.toHaveBeenCalled();
		expect(reportStatus).toHaveBeenCalledWith(config, 42, JobStatus.CompletedError, expect.stringContaining("no browser binary"));
	}, 20000);
});
