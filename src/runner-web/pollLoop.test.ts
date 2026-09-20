import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runRecipeJobLoop } from "./orchestrator/automaticLoop.ts";
import { runTrainingJobLoop } from "./orchestrator/trainingLoop.ts";
import type { RunnerConfig } from "./config.ts";
import { log } from "./logger.ts";
import { startPollLoop } from "./pollLoop.ts";
import type { ClaimedJob } from "./runnerClient.ts";
import { pollRunner } from "./runnerClient.ts";

vi.mock("./runnerClient.ts", () => ({
	pollRunner: vi.fn(),
	isRecipeJob: (job: unknown) => typeof job === "object" && job !== null && "recipe" in job
}));
vi.mock("./orchestrator/automaticLoop.ts", () => ({ runRecipeJobLoop: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./orchestrator/trainingLoop.ts", () => ({ runTrainingJobLoop: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./logger.ts", () => ({ log: vi.fn() }));

const config: RunnerConfig = {
	hubUrl: "http://localhost:4173",
	runnerId: "1",
	runnerSharedSecret: "the-secret"
};

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe("startPollLoop", () => {
	it("calls poll on the configured interval and logs each response", async () => {
		vi.mocked(pollRunner).mockResolvedValue({ hasWork: false });

		const timer = startPollLoop(config, 30, 300);

		await vi.advanceTimersByTimeAsync(30_000);
		expect(pollRunner).toHaveBeenCalledTimes(1);
		expect(pollRunner).toHaveBeenCalledWith(config);
		expect(log).toHaveBeenCalledWith("poll: hasWork=false");

		await vi.advanceTimersByTimeAsync(30_000);
		expect(pollRunner).toHaveBeenCalledTimes(2);

		clearInterval(timer);
	});

	it("logs a failure and continues the loop when a poll call rejects", async () => {
		vi.mocked(pollRunner).mockRejectedValue(new Error("network down"));

		const timer = startPollLoop(config, 30, 300);

		await vi.advanceTimersByTimeAsync(30_000);
		expect(log).toHaveBeenCalledWith("poll failed: network down");

		clearInterval(timer);
	});

	it("dispatches a claimed Training Run Job (no `recipe` field) to the Training loop", async () => {
		const trainingJob: ClaimedJob = {
			id: 7,
			goal: "Learn the thing",
			alternateGoals: [],
			startingUrl: "https://example.com/start",
			allowlist: "https://example.com",
			maxSteps: 5,
			stepTimeoutMs: 15000,
			syntheticDataConfirmed: false,
			ingredients: { startingUrl: "https://example.com/start" },
			sensitiveIngredientNames: [],
			nextStep: { id: "open_starting_url", action: "open", args: [{ ref: "input", name: "startingUrl" }] }
		};
		vi.mocked(pollRunner).mockResolvedValueOnce({ hasWork: true, job: trainingJob }).mockResolvedValue({ hasWork: false });

		const timer = startPollLoop(config, 30, 300);
		await vi.advanceTimersByTimeAsync(30_000);

		expect(runTrainingJobLoop).toHaveBeenCalledWith(config, trainingJob);
		expect(runRecipeJobLoop).not.toHaveBeenCalled();

		clearInterval(timer);
	});

	it("skips poll ticks while the Job loop is running, so it doesn't claim a second Job concurrently", async () => {
		const trainingJob: ClaimedJob = {
			id: 9,
			goal: "Learn the thing",
			alternateGoals: [],
			startingUrl: "https://example.com/start",
			allowlist: "https://example.com",
			maxSteps: 5,
			stepTimeoutMs: 15000,
			syntheticDataConfirmed: false,
			ingredients: {},
			sensitiveIngredientNames: [],
			nextStep: { id: "open_starting_url", action: "open", args: [{ ref: "input", name: "startingUrl" }] }
		};
		let resolveTrainingLoop!: () => void;
		vi.mocked(pollRunner).mockResolvedValueOnce({ hasWork: true, job: trainingJob }).mockResolvedValue({ hasWork: false });
		vi.mocked(runTrainingJobLoop).mockReturnValueOnce(new Promise((resolve) => (resolveTrainingLoop = resolve)));

		const timer = startPollLoop(config, 30, 300);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(pollRunner).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(30_000);
		expect(pollRunner).toHaveBeenCalledTimes(1);

		resolveTrainingLoop();
		await vi.advanceTimersByTimeAsync(0);

		await vi.advanceTimersByTimeAsync(30_000);
		expect(pollRunner).toHaveBeenCalledTimes(2);

		clearInterval(timer);
	});

	it("dispatches a claimed Recipe Job (carrying a `recipe` field) to the Automatic Loop, not the Training loop", async () => {
		const recipeJob = {
			id: 11,
			mode: "execute",
			recipeId: 1,
			recipeVersion: 1,
			recipe: { schemaVersion: 1, inputs: {}, outputs: {}, steps: [], recoveries: [] },
			ingredients: {},
			controls: { allowedOrigins: ["https://example.com"] },
			stepTimeoutMs: 5000,
			comms: { statusUrl: "/api/hub/jobs/11", artifactsUrl: "/api/runner/runners/1/jobs/11/artifacts" }
		};
		vi.mocked(pollRunner).mockResolvedValueOnce({ hasWork: true, job: recipeJob }).mockResolvedValue({ hasWork: false });

		const timer = startPollLoop(config, 30, 300);
		await vi.advanceTimersByTimeAsync(30_000);

		expect(runRecipeJobLoop).toHaveBeenCalledWith(config, recipeJob, 300);
		expect(runTrainingJobLoop).not.toHaveBeenCalled();

		clearInterval(timer);
	});
});
