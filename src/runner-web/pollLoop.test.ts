import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RunnerConfig } from "./config.ts";
import { log } from "./logger.ts";
import { startPollLoop } from "./pollLoop.ts";
import { pollRunner } from "./runnerClient.ts";

vi.mock("./runnerClient.ts", () => ({ pollRunner: vi.fn() }));
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
});
