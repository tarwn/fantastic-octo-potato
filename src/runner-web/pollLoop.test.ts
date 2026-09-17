import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RunnerConfig } from "./config.ts";
import { log } from "./logger.ts";
import { startPollLoop } from "./pollLoop.ts";
import { type ClaimedJob, pollRunner, reportStep, RunnerHttpError } from "./runnerClient.ts";

vi.mock("./runnerClient.ts", () => ({
	pollRunner: vi.fn(),
	reportStep: vi.fn(),
	RunnerHttpError: class RunnerHttpError extends Error {
		status: number;
		constructor(status: number, message: string) {
			super(message);
			this.status = status;
		}
	}
}));
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

		const timer = startPollLoop(config, 30);

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

		const timer = startPollLoop(config, 30);

		await vi.advanceTimersByTimeAsync(30_000);
		expect(log).toHaveBeenCalledWith("poll failed: network down");

		clearInterval(timer);
	});

	it("runs the claimed Job's step loop, reporting each step until a terminal response, then resumes polling", async () => {
		const job: ClaimedJob = {
			id: 7,
			goal: "Learn the thing",
			startingUrl: "https://example.com/start",
			allowlist: "https://example.com",
			maxSteps: 5,
			nextStep: { sequence: 1, kind: "step", text: "navigate to starting URL" }
		};
		vi.mocked(pollRunner).mockResolvedValueOnce({ hasWork: true, job }).mockResolvedValue({ hasWork: false });
		vi.mocked(reportStep)
			.mockResolvedValueOnce({
				jobStatusId: 2,
				nextStep: { sequence: 2, kind: "step", text: "extract sample_field", resultField: "sample_field", resultValue: "sample-value" }
			})
			.mockResolvedValueOnce({ jobStatusId: 3 });

		const timer = startPollLoop(config, 30);
		await vi.advanceTimersByTimeAsync(30_000);
		await vi.advanceTimersByTimeAsync(2_000); // flush the step-action delays between the two reported steps

		expect(reportStep).toHaveBeenNthCalledWith(1, config, 7, {
			kind: "step",
			sequence: 1,
			message: "navigate to starting URL",
			inputs: [],
			outputs: []
		});
		expect(reportStep).toHaveBeenNthCalledWith(2, config, 7, {
			kind: "step",
			sequence: 2,
			message: "extract sample_field",
			inputs: [],
			outputs: [{ fieldName: "sample_field", value: "sample-value" }]
		});
		expect(log).toHaveBeenCalledWith("job 7: reached a terminal status, resuming polling");

		await vi.advanceTimersByTimeAsync(30_000);
		expect(pollRunner).toHaveBeenCalledTimes(2);

		clearInterval(timer);
	});

	it("abandons the Job loop back to polling on a 403/404 from reportStep", async () => {
		const job: ClaimedJob = {
			id: 8,
			goal: "Learn the thing",
			startingUrl: "https://example.com/start",
			allowlist: "https://example.com",
			maxSteps: 5,
			nextStep: { sequence: 1, kind: "step", text: "navigate to starting URL" }
		};
		vi.mocked(pollRunner).mockResolvedValueOnce({ hasWork: true, job }).mockResolvedValue({ hasWork: false });
		vi.mocked(reportStep).mockRejectedValueOnce(new RunnerHttpError(403, "reportStep failed: 403 not the owner"));

		const timer = startPollLoop(config, 30);
		await vi.advanceTimersByTimeAsync(30_000);
		await vi.advanceTimersByTimeAsync(1_000); // flush the step-action delay before the rejected reportStep call

		expect(log).toHaveBeenCalledWith("job 8: reportStep 403, abandoning job loop back to polling: reportStep failed: 403 not the owner");

		await vi.advanceTimersByTimeAsync(30_000);
		expect(pollRunner).toHaveBeenCalledTimes(2);

		clearInterval(timer);
	});

	it("logs and abandons the Job loop back to polling on a non-HTTP reportStep failure, without an unhandled rejection", async () => {
		const job: ClaimedJob = {
			id: 10,
			goal: "Learn the thing",
			startingUrl: "https://example.com/start",
			allowlist: "https://example.com",
			maxSteps: 5,
			nextStep: { sequence: 1, kind: "step", text: "navigate to starting URL" }
		};
		vi.mocked(pollRunner).mockResolvedValueOnce({ hasWork: true, job }).mockResolvedValue({ hasWork: false });
		vi.mocked(reportStep).mockRejectedValueOnce(new Error("network down"));

		const timer = startPollLoop(config, 30);
		await vi.advanceTimersByTimeAsync(30_000);
		await vi.advanceTimersByTimeAsync(1_000); // flush the step-action delay before the rejected reportStep call

		expect(log).toHaveBeenCalledWith("job 10: reportStep failed, abandoning job loop back to polling: network down");

		await vi.advanceTimersByTimeAsync(30_000);
		expect(pollRunner).toHaveBeenCalledTimes(2);

		clearInterval(timer);
	});

	it("skips poll ticks while the Job loop is running, so it doesn't claim a second Job concurrently", async () => {
		const job: ClaimedJob = {
			id: 9,
			goal: "Learn the thing",
			startingUrl: "https://example.com/start",
			allowlist: "https://example.com",
			maxSteps: 5,
			nextStep: { sequence: 1, kind: "step", text: "navigate to starting URL" }
		};
		let resolveReportStep!: (value: { jobStatusId: number }) => void;
		vi.mocked(pollRunner).mockResolvedValueOnce({ hasWork: true, job }).mockResolvedValue({ hasWork: false });
		vi.mocked(reportStep).mockReturnValueOnce(new Promise((resolve) => (resolveReportStep = resolve)));

		const timer = startPollLoop(config, 30);
		await vi.advanceTimersByTimeAsync(30_000);
		await vi.advanceTimersByTimeAsync(1_000); // flush the step-action delay so reportStep's pending promise is in flight
		expect(pollRunner).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(29_000);
		expect(pollRunner).toHaveBeenCalledTimes(1);

		resolveReportStep({ jobStatusId: 3 });
		await vi.advanceTimersByTimeAsync(0);

		await vi.advanceTimersByTimeAsync(30_000);
		expect(pollRunner).toHaveBeenCalledTimes(2);

		clearInterval(timer);
	});
});
