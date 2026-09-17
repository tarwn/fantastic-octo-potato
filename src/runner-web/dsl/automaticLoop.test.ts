import { afterEach, describe, expect, it, vi } from "vitest";

import { type ClaimedRecipeJob, fetchJobStatus, JobStatus, reportDslStep, reportStatus, uploadArtifact } from "../runnerClient.ts";

import { executeAction } from "./actions.ts";
import { runRecipeJobLoop } from "./automaticLoop.ts";
import { launchBrowserSession } from "./browserSession.ts";
import type { FieldDeclaration, RecipeDefinition, Recovery, Step } from "./types.ts";

vi.mock("./actions.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./actions.ts")>();
	return { ...actual, executeAction: vi.fn(actual.executeAction) };
});

vi.mock("./browserSession.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./browserSession.ts")>();
	return { ...actual, launchBrowserSession: vi.fn(actual.launchBrowserSession) };
});

vi.mock("../runnerClient.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../runnerClient.ts")>();
	return {
		...actual,
		reportDslStep: vi.fn().mockResolvedValue({ jobStatusId: actual.JobStatus.Running }),
		reportStatus: vi.fn().mockResolvedValue({ jobStatusId: actual.JobStatus.Running }),
		uploadArtifact: vi.fn().mockResolvedValue({ id: 1 }),
		fetchJobStatus: vi.fn()
	};
});

const config = { hubUrl: "http://localhost:4173", runnerId: "1", runnerSharedSecret: "the-secret" };

const STRING_FIELD: FieldDeclaration = { type: "string", description: "", required: false, nullable: true, sensitive: false };

// Every test's fixture content is reached via a leading `open` Step to a data: URL — the real
// launchBrowserSession()'d page navigates there itself, so no browser/page mocking is needed; only
// the allowedOrigins control needs to accept the "data:" scheme.
function openStep(html: string): Extract<Step, { action: "open" }> {
	return { id: "open_fixture", action: "open", args: [`data:text/html,${encodeURIComponent(html)}`] };
}

afterEach(() => {
	vi.clearAllMocks();
});

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

describe("runRecipeJobLoop: happy path", () => {
	it("executes each Step, reports+uploads a screenshot per Step and on terminal exit, and reports Completed-Success", async () => {
		const recipe: RecipeDefinition = {
			schemaVersion: 1,
			inputs: { username: { ...STRING_FIELD, sensitive: true, required: true, nullable: false } },
			outputs: { secret: STRING_FIELD },
			steps: [
				openStep("<button id=\"go\">Go</button><div id=\"secretField\">mysecret</div>"),
				{ id: "click_go", action: "click", args: [{ by: "css", value: "#go" }] },
				{ id: "read_secret", action: "read", args: [{ by: "css", value: "#secretField" }, "text", { ref: "output", name: "secret" }] },
				{ id: "done", action: "finish", args: [null] }
			],
			recoveries: []
		};
		const job = buildJob({ recipe, ingredients: { username: "mysecret" } });

		await runRecipeJobLoop(config, job, 300);

		expect(reportDslStep).toHaveBeenNthCalledWith(1, config, 42, { stepId: "open_fixture", outcome: "succeeded", extractions: [] });
		expect(reportDslStep).toHaveBeenNthCalledWith(2, config, 42, { stepId: "click_go", outcome: "succeeded", extractions: [] });
		expect(reportDslStep).toHaveBeenNthCalledWith(3, config, 42, {
			stepId: "read_secret",
			outcome: "succeeded",
			extractions: [{ fieldName: "secret", value: "mysecret" }]
		});
		expect(reportDslStep).toHaveBeenNthCalledWith(4, config, 42, { stepId: "done", outcome: "succeeded", extractions: [] });
		expect(uploadArtifact).toHaveBeenCalledTimes(5); // 4 Steps + 1 terminal-exit screenshot
		expect(uploadArtifact).toHaveBeenNthCalledWith(5, config, "/api/runner/runners/1/jobs/42/artifacts", "terminal", expect.any(String));
		expect(reportStatus).toHaveBeenCalledWith(config, 42, JobStatus.CompletedSuccess, "Recipe finished");
	}, 20000);
});

describe("runRecipeJobLoop: recovery", () => {
	it("applies a matching recoverable scenario mid-run, reports it under the Recovery's own id, then continues", async () => {
		const recovery: Recovery = {
			id: "dismiss_popup",
			description: "Dismiss the blocking popup",
			when: { test: "visible", args: [{ by: "css", value: "#popup" }] },
			steps: [{ id: "click_dismiss", action: "click", args: [{ by: "css", value: "#dismiss" }] }]
		};
		const recipe: RecipeDefinition = {
			schemaVersion: 1,
			inputs: {},
			outputs: {},
			steps: [
				openStep(`
					<div id="popup">Blocking</div>
					<button id="dismiss" onclick="document.getElementById('popup').remove()">Dismiss</button>
					<button id="go">Go</button>
				`),
				{ id: "click_go", action: "click", args: [{ by: "css", value: "#go" }] },
				{ id: "finish_step", action: "finish", args: [null] }
			],
			recoveries: [recovery]
		};
		const job = buildJob({ recipe });

		await runRecipeJobLoop(config, job, 300);

		// The popup is already visible right after the fixture loads (open_fixture), so the
		// post-step recovery scan fires there — before click_go ever runs — not after click_go.
		const stepIds = vi.mocked(reportDslStep).mock.calls.map(([, , body]) => body.stepId);
		expect(stepIds).toEqual(["open_fixture", "click_dismiss", "click_go", "finish_step"]);
		expect(reportDslStep).toHaveBeenNthCalledWith(2, config, 42, {
			stepId: "click_dismiss",
			parentStepId: "dismiss_popup",
			outcome: "succeeded",
			extractions: []
		});
		expect(reportStatus).toHaveBeenCalledWith(config, 42, JobStatus.CompletedSuccess, "Recipe finished");
	}, 20000);
});

describe("runRecipeJobLoop: unrecoverable outcome mapping", () => {
	it("requests Intervention when a Step fails with no matching recovery, then times out to Completed-Failed", async () => {
		const recipe: RecipeDefinition = {
			schemaVersion: 1,
			inputs: {},
			outputs: {},
			steps: [openStep("<button id=\"go\">Go</button>"), { id: "click_missing", action: "click", args: [{ by: "css", value: "#does-not-exist" }] }],
			recoveries: []
		};
		const job = buildJob({ recipe });

		// A negative timeout guarantees the deadline has already passed on the loop's first check,
		// so the test doesn't need to wait out a real polling interval.
		await runRecipeJobLoop(config, job, -1);

		expect(reportStatus).toHaveBeenNthCalledWith(1, config, 42, JobStatus.InterventionRequested, expect.any(String));
		expect(reportStatus).toHaveBeenNthCalledWith(2, config, 42, JobStatus.CompletedFailed, expect.stringContaining("timed out"));
		expect(fetchJobStatus).not.toHaveBeenCalled();
	}, 20000);

	it("reports Completed-Error on an allowlist violation, without reporting the triggering Step", async () => {
		const recipe: RecipeDefinition = {
			schemaVersion: 1,
			inputs: {},
			outputs: {},
			steps: [openStep("<button id=\"go\">Go</button>"), { id: "click_go", action: "click", args: [{ by: "css", value: "#go" }] }],
			recoveries: []
		};
		// allowedOrigins doesn't include "data:" — even the leading `open` Step trips the check.
		const job = buildJob({ recipe, controls: { allowedOrigins: ["https://only-this-origin.example.com"] } });

		await runRecipeJobLoop(config, job, 300);

		expect(reportDslStep).not.toHaveBeenCalled();
		expect(reportStatus).toHaveBeenCalledWith(config, 42, JobStatus.CompletedError, expect.stringContaining("disallowed origin"));
	}, 20000);

	it("reports Completed-Error on an unexpected technical error the DSL driver lets propagate", async () => {
		const recipe: RecipeDefinition = {
			schemaVersion: 1,
			inputs: {},
			outputs: {},
			steps: [{ id: "s1", action: "click", args: [{ by: "css", value: "#go" }] }],
			recoveries: []
		};
		const job = buildJob({ recipe });
		// The only Step's executeAction call is overridden to simulate an uncaught technical error
		// escaping dsl/actions.ts — no real page navigation is needed to exercise this path.
		vi.mocked(executeAction).mockRejectedValueOnce(new Error("boom"));

		await runRecipeJobLoop(config, job, 300);

		expect(reportDslStep).not.toHaveBeenCalled();
		expect(reportStatus).toHaveBeenCalledWith(config, 42, JobStatus.CompletedError, expect.stringContaining("boom"));
	}, 20000);

	it("reports Completed-Error, without ever opening a browser page, when launching the browser session itself fails", async () => {
		const recipe: RecipeDefinition = {
			schemaVersion: 1,
			inputs: {},
			outputs: {},
			steps: [{ id: "s1", action: "click", args: [{ by: "css", value: "#go" }] }],
			recoveries: []
		};
		const job = buildJob({ recipe });
		vi.mocked(launchBrowserSession).mockRejectedValueOnce(new Error("no browser binary"));

		await runRecipeJobLoop(config, job, 300);

		expect(executeAction).not.toHaveBeenCalled();
		expect(reportDslStep).not.toHaveBeenCalled();
		expect(uploadArtifact).not.toHaveBeenCalled();
		expect(reportStatus).toHaveBeenCalledWith(config, 42, JobStatus.CompletedError, expect.stringContaining("no browser binary"));
	}, 20000);
});

describe("runRecipeJobLoop: bounded recovery attempts", () => {
	it("stops re-applying a Recovery once it has run its maximum number of times, letting the Job proceed normally", async () => {
		const recovery: Recovery = {
			id: "persistent_recovery",
			description: "A recovery whose condition never actually clears",
			when: { test: "visible", args: [{ by: "css", value: "#banner" }] },
			steps: [{ id: "ack", action: "click", args: [{ by: "css", value: "#go" }] }]
		};
		const recipe: RecipeDefinition = {
			schemaVersion: 1,
			inputs: {},
			outputs: {},
			steps: [
				openStep("<div id=\"banner\">Always here</div><button id=\"go\">Go</button>"),
				{ id: "click1", action: "click", args: [{ by: "css", value: "#go" }] },
				{ id: "click2", action: "click", args: [{ by: "css", value: "#go" }] },
				{ id: "click3", action: "click", args: [{ by: "css", value: "#go" }] },
				{ id: "finish_step", action: "finish", args: [null] }
			],
			recoveries: [recovery]
		};
		const job = buildJob({ recipe });

		await runRecipeJobLoop(config, job, 300);

		const recoveryCalls = vi.mocked(reportDslStep).mock.calls.filter(([, , body]) => body.parentStepId === "persistent_recovery");
		expect(recoveryCalls).toHaveLength(3); // capped, despite #banner staying visible after every attempt
		expect(reportStatus).toHaveBeenCalledWith(config, 42, JobStatus.CompletedSuccess, "Recipe finished");
	}, 20000);
});
