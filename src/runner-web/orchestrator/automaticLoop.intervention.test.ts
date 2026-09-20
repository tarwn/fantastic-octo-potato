import type { Request, Route } from "playwright";
import { afterEach, describe, expect, it, vi } from "vitest";

import { executeAction } from "../browser/actions.ts";
import { launchBrowserSession, type RouteHandler } from "../browser/browserSession.ts";
import type { RecipeDefinition, Step } from "../dsl/types.ts";
import { type ClaimedRecipeJob, fetchJobStatus, fetchPendingCommand, JobStatus, type PendingCommand, reportCommandResult, reportStatus, uploadArtifact } from "../runnerClient.ts";

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
		fetchJobStatus: vi.fn(),
		fetchPendingCommand: vi.fn().mockResolvedValue(null),
		reportCommandResult: vi.fn().mockResolvedValue(true)
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
	vi.mocked(fetchPendingCommand).mockReset().mockResolvedValue(null);
	vi.mocked(reportCommandResult).mockReset().mockResolvedValue(true);
});

async function expectBrowserClosed(): Promise<void> {
	const session = await (vi.mocked(launchBrowserSession).mock.results[0].value as ReturnType<typeof launchBrowserSession>);
	expect(session.browser.isConnected()).toBe(false);
}

describe("runRecipeJobLoop: Intervention wait", () => {
	it("times out to Completed-Failed while no operator takes control", async () => {
		vi.mocked(fetchJobStatus).mockResolvedValue({ statusId: JobStatus.InterventionRequested, resumeStepId: null });

		await runRecipeJobLoop(config, job, 0.1);

		expect(reportStatus).toHaveBeenLastCalledWith(config, 42, JobStatus.CompletedFailed, "Intervention timed out with no human recovery");
		await expectBrowserClosed();
	}, 20000);

	it("restarts the timeout as an idle timeout once an operator takes control", async () => {
		vi.mocked(fetchJobStatus).mockResolvedValue({ statusId: JobStatus.InteractiveUser, resumeStepId: null });

		await runRecipeJobLoop(config, job, 0.3);

		// The first poll already lands after the original deadline would have expired, so a second
		// poll proves the takeover restarted the clock instead of failing the Job immediately.
		expect(vi.mocked(fetchJobStatus).mock.calls.length).toBeGreaterThanOrEqual(2);
		expect(reportStatus).toHaveBeenLastCalledWith(config, 42, JobStatus.CompletedFailed, "Interactive session idle timed out");
		await expectBrowserClosed();
	}, 20000);

	it("stops without reporting when Hub moves the Job to a terminal status (cancelled or ended)", async () => {
		vi.mocked(fetchJobStatus).mockResolvedValue({ statusId: JobStatus.CompletedCancelled, resumeStepId: null });

		await runRecipeJobLoop(config, job, 300);

		expect(reportStatus).toHaveBeenCalledTimes(1);
		expect(reportStatus).toHaveBeenCalledWith(config, 42, JobStatus.InterventionRequested, expect.any(String), "click_missing");
		await expectBrowserClosed();
	}, 20000);

	it("reports Running and resumes at the handed-back Step, finishing the Job in the same session", async () => {
		const resumable = { ...job, recipe: { ...blockedRecipe, steps: [...blockedRecipe.steps, { id: "finish_up", action: "finish", args: [null] } as Step] } };
		vi.mocked(fetchJobStatus).mockResolvedValueOnce({ statusId: JobStatus.InteractiveUser, resumeStepId: "finish_up" });

		await runRecipeJobLoop(config, resumable, 300);

		expect(reportStatus).toHaveBeenCalledWith(config, 42, JobStatus.Running, "Resuming at step finish_up");
		expect(reportStatus).toHaveBeenLastCalledWith(config, 42, JobStatus.CompletedSuccess, "Recipe finished");
		expect(launchBrowserSession).toHaveBeenCalledOnce();
		await expectBrowserClosed();
	}, 20000);

	it("requests intervention again when the resume Step fails, then follows the new wait", async () => {
		vi.mocked(fetchJobStatus)
			.mockResolvedValueOnce({ statusId: JobStatus.InteractiveUser, resumeStepId: "click_missing" })
			.mockResolvedValue({ statusId: JobStatus.CompletedCancelled, resumeStepId: null });

		await runRecipeJobLoop(config, job, 300);

		const requests = vi.mocked(reportStatus).mock.calls.filter((call) => call[2] === JobStatus.InterventionRequested);
		expect(requests).toHaveLength(2);
		expect(requests[1][4]).toBe("click_missing");
		await expectBrowserClosed();
	}, 20000);

	it("reports Completed-Error when the resume Step is not in the Recipe", async () => {
		vi.mocked(fetchJobStatus).mockResolvedValueOnce({ statusId: JobStatus.InteractiveUser, resumeStepId: "nope" });

		await runRecipeJobLoop(config, job, 300);

		expect(reportStatus).toHaveBeenLastCalledWith(config, 42, JobStatus.CompletedError, "Resume step not found: nope");
		await expectBrowserClosed();
	}, 20000);

	it("reports Completed-Error on an unexpected non-terminal status change", async () => {
		vi.mocked(fetchJobStatus).mockResolvedValue({ statusId: JobStatus.Pending, resumeStepId: null });

		await runRecipeJobLoop(config, job, 300);

		expect(reportStatus).toHaveBeenLastCalledWith(config, 42, JobStatus.CompletedError, `Unexpected status change to ${JobStatus.Pending} during intervention`);
		await expectBrowserClosed();
	}, 20000);
});

// A full-viewport button, so any point clicked lands on it; clicking it reveals #done.
const clickableFixture = `data:text/html,${encodeURIComponent("<button style=\"position:fixed;inset:0;width:100%;height:100%\" onclick=\"document.body.insertAdjacentHTML('beforeend','<p id=done>done</p>')\">Go</button>")}`;

// Simulates the allowlist route handler blocking a navigation mid-command (see automaticLoop.test.ts).
async function simulateBlockedRequest(url: string): Promise<void> {
	const handler = vi.mocked(launchBrowserSession).mock.calls[0][0] as RouteHandler;
	const route = { abort: vi.fn().mockResolvedValue(undefined), continue: vi.fn().mockResolvedValue(undefined) } as unknown as Route;
	const request = { url: () => url, isNavigationRequest: () => true } as unknown as Request;
	await handler(route, request);
}

// vi.clearAllMocks leaves a mockImplementation override in place, so tests wrap this unmocked original.
const realExecuteAction = (await vi.importActual<typeof import("../browser/actions.ts")>("../browser/actions.ts")).executeAction;

function commandJob(fixture: string): ClaimedRecipeJob {
	return {
		...job,
		recipe: {
			...blockedRecipe,
			steps: [
				{ id: "open_fixture", action: "open", args: [fixture] } as Step,
				{ id: "click_missing", action: "click", args: [{ by: "css", value: "#does-not-exist" }] },
				{ id: "verify_clicked", action: "verify", args: [{ test: "exists", args: [{ by: "css", value: "#done" }] }] },
				{ id: "finish_up", action: "finish", args: [null] } as Step
			]
		}
	};
}

const clickCommand: PendingCommand = { id: 7, stepId: "intervention-7", kind: "click", payload: { x: 30, y: 40 } };

describe("runRecipeJobLoop: operator commands", () => {
	it("executes a pending click once, reports its result and screenshot under the command's Step id, and lets a hand-back continue from the clicked page", async () => {
		vi.mocked(fetchJobStatus)
			.mockResolvedValueOnce({ statusId: JobStatus.InteractiveUser, resumeStepId: null })
			.mockResolvedValueOnce({ statusId: JobStatus.InteractiveUser, resumeStepId: "verify_clicked" });
		vi.mocked(fetchPendingCommand).mockResolvedValueOnce(clickCommand);

		await runRecipeJobLoop(config, commandJob(clickableFixture), 300);

		expect(reportCommandResult).toHaveBeenCalledOnce();
		expect(reportCommandResult).toHaveBeenCalledWith(config, 42, 7, { outcome: "succeeded", targetDescription: expect.any(Object) });
		expect(uploadArtifact).toHaveBeenCalledWith(config, job.comms.artifactsUrl, "intervention-7", expect.any(String));
		expect(reportStatus).toHaveBeenLastCalledWith(config, 42, JobStatus.CompletedSuccess, "Recipe finished");
		await expectBrowserClosed();
	}, 20000);

	it("runs an assign command as a DSL assign Step and reports its result", async () => {
		vi.mocked(fetchJobStatus).mockResolvedValue({ statusId: JobStatus.InteractiveUser, resumeStepId: null });
		vi.mocked(fetchPendingCommand).mockResolvedValueOnce({ id: 8, stepId: "intervention-8", kind: "assign", payload: { name: "note", value: "hi" } });
		const assigning = commandJob(clickableFixture);
		assigning.recipe = { ...assigning.recipe, outputs: { note: { type: "string", description: "n", required: false, nullable: false, sensitive: false } } };

		await runRecipeJobLoop(config, assigning, 0.3);

		expect(executeAction).toHaveBeenCalledWith(expect.anything(), { id: "intervention-8", action: "assign", args: [{ ref: "output", name: "note" }, "hi"] }, expect.anything());
		expect(reportCommandResult).toHaveBeenCalledWith(config, 42, 8, { outcome: "succeeded", targetDescription: expect.any(Object) });
		expect(uploadArtifact).toHaveBeenCalledWith(config, job.comms.artifactsUrl, "intervention-8", expect.any(String));
	}, 20000);

	it("runs a prompt command's Step under the command's Step id and reports its result", async () => {
		vi.mocked(fetchJobStatus).mockResolvedValue({ statusId: JobStatus.InteractiveUser, resumeStepId: null });
		vi.mocked(fetchPendingCommand).mockResolvedValueOnce({
			id: 9,
			stepId: "intervention-9",
			kind: "prompt",
			payload: { step: { id: "llm_chosen_id", action: "click", args: [{ by: "point", x: 30, y: 40 }], intent: "Click the button" } }
		});

		await runRecipeJobLoop(config, commandJob(clickableFixture), 0.3);

		expect(executeAction).toHaveBeenCalledWith(
			expect.anything(),
			{ id: "intervention-9", action: "click", args: [{ by: "point", x: 30, y: 40 }], intent: "Click the button" },
			expect.anything()
		);
		expect(reportCommandResult).toHaveBeenCalledWith(config, 42, 9, { outcome: "succeeded", targetDescription: expect.any(Object) });
		expect(uploadArtifact).toHaveBeenCalledWith(config, job.comms.artifactsUrl, "intervention-9", expect.any(String));
	}, 20000);

	it("retries a command's screenshot once when the first attempt fails, e.g. mid-navigation", async () => {
		vi.mocked(fetchJobStatus).mockResolvedValue({ statusId: JobStatus.InteractiveUser, resumeStepId: null });
		vi.mocked(fetchPendingCommand).mockResolvedValueOnce(clickCommand);
		let failedOnce = false;
		vi.mocked(uploadArtifact).mockImplementation((_config, _url, stepId) => {
			if (stepId === "intervention-7" && !failedOnce) {
				failedOnce = true;
				return Promise.reject(new Error("Execution context was destroyed"));
			}
			return Promise.resolve({ id: 1 });
		});

		try {
			await runRecipeJobLoop(config, commandJob(clickableFixture), 0.3);
		}
		finally {
			vi.mocked(uploadArtifact).mockResolvedValue({ id: 1 });
		}

		expect(vi.mocked(uploadArtifact).mock.calls.filter(([, , stepId]) => stepId === "intervention-7")).toHaveLength(2);
	}, 20000);

	it("resets the idle timeout after each command", async () => {
		vi.mocked(fetchJobStatus).mockResolvedValue({ statusId: JobStatus.InteractiveUser, resumeStepId: null });
		vi.mocked(fetchPendingCommand).mockResolvedValueOnce(clickCommand);
		const times: Record<string, number> = {};
		vi.mocked(reportCommandResult).mockImplementation(() => {
			times.result = Date.now();
			return Promise.resolve(true);
		});
		vi.mocked(reportStatus).mockImplementation(() => {
			times.failed = Date.now();
			return Promise.resolve({ jobStatusId: JobStatus.Running });
		});

		await runRecipeJobLoop(config, commandJob(clickableFixture), 0.3);

		expect(times.failed - times.result).toBeGreaterThanOrEqual(290);
		expect(reportStatus).toHaveBeenLastCalledWith(config, 42, JobStatus.CompletedFailed, "Interactive session idle timed out");
	}, 20000);

	it("discards the screenshot when Hub refuses the result because the Job left Interactive-User, then follows the new status", async () => {
		vi.mocked(fetchJobStatus)
			.mockResolvedValueOnce({ statusId: JobStatus.InteractiveUser, resumeStepId: null })
			.mockResolvedValue({ statusId: JobStatus.CompletedCancelled, resumeStepId: null });
		vi.mocked(fetchPendingCommand).mockResolvedValueOnce(clickCommand);
		vi.mocked(reportCommandResult).mockResolvedValue(false);

		await runRecipeJobLoop(config, commandJob(clickableFixture), 300);

		expect(uploadArtifact).not.toHaveBeenCalledWith(config, job.comms.artifactsUrl, "intervention-7", expect.any(String));
		expect(reportStatus).not.toHaveBeenCalledWith(config, 42, JobStatus.CompletedError, expect.any(String));
		await expectBrowserClosed();
	}, 20000);

	it("reports a failed result and Completed-Error when the click navigates to a disallowed origin", async () => {
		vi.mocked(fetchJobStatus).mockResolvedValue({ statusId: JobStatus.InteractiveUser, resumeStepId: null });
		vi.mocked(fetchPendingCommand).mockResolvedValueOnce(clickCommand);

		vi.mocked(executeAction).mockImplementation(async (page, step, ctx) => {
			if (step.id === clickCommand.stepId) {
				await simulateBlockedRequest("https://blocked.example.net/redirected");
			}
			return realExecuteAction(page, step, ctx);
		});

		await runRecipeJobLoop(config, commandJob(clickableFixture), 300);

		vi.mocked(executeAction).mockImplementation(realExecuteAction);
		expect(reportCommandResult).toHaveBeenCalledWith(config, 42, 7, { outcome: "failed", targetDescription: expect.any(Object) });
		expect(reportStatus).toHaveBeenLastCalledWith(config, 42, JobStatus.CompletedError, expect.stringContaining("disallowed origin"));
		await expectBrowserClosed();
	}, 20000);

	it("does not overwrite a newer status with Completed-Error when Hub refuses the failed result", async () => {
		vi.mocked(fetchJobStatus)
			.mockResolvedValueOnce({ statusId: JobStatus.InteractiveUser, resumeStepId: null })
			.mockResolvedValue({ statusId: JobStatus.CompletedCancelled, resumeStepId: null });
		vi.mocked(fetchPendingCommand).mockResolvedValueOnce(clickCommand);
		vi.mocked(reportCommandResult).mockResolvedValue(false);
		vi.mocked(executeAction).mockImplementation((page, step, ctx) => (step.id === clickCommand.stepId ? Promise.reject(new Error("boom")) : realExecuteAction(page, step, ctx)));

		await runRecipeJobLoop(config, commandJob(clickableFixture), 300);

		vi.mocked(executeAction).mockImplementation(realExecuteAction);
		expect(reportStatus).not.toHaveBeenCalledWith(config, 42, JobStatus.CompletedError, expect.any(String));
		await expectBrowserClosed();
	}, 20000);

	it("reports a failed result and Completed-Error when executing the command throws", async () => {
		vi.mocked(fetchJobStatus).mockResolvedValue({ statusId: JobStatus.InteractiveUser, resumeStepId: null });
		vi.mocked(fetchPendingCommand).mockResolvedValueOnce(clickCommand);
		vi.mocked(executeAction).mockImplementation((page, step, ctx) => (step.id === clickCommand.stepId ? Promise.reject(new Error("boom")) : realExecuteAction(page, step, ctx)));

		await runRecipeJobLoop(config, commandJob(clickableFixture), 300);

		vi.mocked(executeAction).mockImplementation(realExecuteAction);
		expect(reportCommandResult).toHaveBeenCalledWith(config, 42, 7, { outcome: "failed", targetDescription: expect.any(Object) });
		expect(reportStatus).toHaveBeenLastCalledWith(config, 42, JobStatus.CompletedError, "Unexpected error executing command intervention-7: boom");
		await expectBrowserClosed();
	}, 20000);
});
