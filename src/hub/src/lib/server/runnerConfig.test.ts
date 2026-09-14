import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv: {
	RUNNER_SHARED_SECRET?: string;
	RUNNER_POLL_INTERVAL_SECONDS?: string;
	RUNNER_INTERVENTION_TIMEOUT_SECONDS?: string;
} = {};

vi.mock("$env/dynamic/private", () => ({ env: mockEnv }));

beforeEach(() => {
	delete mockEnv.RUNNER_SHARED_SECRET;
	delete mockEnv.RUNNER_POLL_INTERVAL_SECONDS;
	delete mockEnv.RUNNER_INTERVENTION_TIMEOUT_SECONDS;
	vi.resetModules();
});

describe("requireRunnerSharedSecret", () => {
	it("throws when RUNNER_SHARED_SECRET is unset", async () => {
		const { requireRunnerSharedSecret } = await import("./runnerConfig");

		expect(() => requireRunnerSharedSecret()).toThrow(/RUNNER_SHARED_SECRET is not set/);
	});

	it("returns the configured secret", async () => {
		mockEnv.RUNNER_SHARED_SECRET = "the-secret";
		const { requireRunnerSharedSecret } = await import("./runnerConfig");

		expect(requireRunnerSharedSecret()).toBe("the-secret");
	});
});

describe("getPollIntervalSeconds", () => {
	it("defaults when unset", async () => {
		const { getPollIntervalSeconds } = await import("./runnerConfig");

		expect(getPollIntervalSeconds()).toBe(30);
	});

	it("uses the env override when set", async () => {
		mockEnv.RUNNER_POLL_INTERVAL_SECONDS = "1";
		const { getPollIntervalSeconds } = await import("./runnerConfig");

		expect(getPollIntervalSeconds()).toBe(1);
	});

	it("throws when the override is not a valid number", async () => {
		mockEnv.RUNNER_POLL_INTERVAL_SECONDS = "abc";
		const { getPollIntervalSeconds } = await import("./runnerConfig");

		expect(() => getPollIntervalSeconds()).toThrow(/RUNNER_POLL_INTERVAL_SECONDS is set to "abc"/);
	});
});

describe("getInterventionTimeoutSeconds", () => {
	it("defaults when unset", async () => {
		const { getInterventionTimeoutSeconds } = await import("./runnerConfig");

		expect(getInterventionTimeoutSeconds()).toBe(300);
	});

	it("uses the env override when set", async () => {
		mockEnv.RUNNER_INTERVENTION_TIMEOUT_SECONDS = "5";
		const { getInterventionTimeoutSeconds } = await import("./runnerConfig");

		expect(getInterventionTimeoutSeconds()).toBe(5);
	});
});
