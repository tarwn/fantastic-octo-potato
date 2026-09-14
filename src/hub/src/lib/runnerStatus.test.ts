import { describe, expect, it } from "vitest";

import { getRunnerStatus } from "./runnerStatus";

describe("getRunnerStatus", () => {
	const now = new Date("2026-09-14T00:10:00.000Z");

	it("is idle when there is no heartbeat", () => {
		expect(getRunnerStatus(null, now)).toBe("idle");
	});

	it("is alive when the heartbeat is just under the 60-second threshold", () => {
		const lastHeartbeatOn = new Date(now.getTime() - 59_000);

		expect(getRunnerStatus(lastHeartbeatOn, now)).toBe("alive");
	});

	it("is alive when the heartbeat is exactly at the 60-second threshold", () => {
		const lastHeartbeatOn = new Date(now.getTime() - 60_000);

		expect(getRunnerStatus(lastHeartbeatOn, now)).toBe("alive");
	});

	it("is idle when the heartbeat is just over the 60-second threshold", () => {
		const lastHeartbeatOn = new Date(now.getTime() - 61_000);

		expect(getRunnerStatus(lastHeartbeatOn, now)).toBe("idle");
	});
});
