import { describe, expect, it } from "vitest";

import { JobStatus } from "./jobStatus";
import { chooseRefreshIntervalSeconds, FAST_REFRESH_INTERVAL_SECONDS, REFRESH_INTERVAL_SECONDS } from "./refreshInterval";

const NOW = new Date("2026-09-20T12:00:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);

describe("chooseRefreshIntervalSeconds", () => {
	it("is fast for a non-terminal Job with a recent Transcript entry", () => {
		expect(chooseRefreshIntervalSeconds({ jobStatusId: JobStatus.Running, transcript: [{ createdAt: hoursAgo(1) }] }, NOW)).toBe(FAST_REFRESH_INTERVAL_SECONDS);
	});

	it("is slow for a terminal Job", () => {
		expect(chooseRefreshIntervalSeconds({ jobStatusId: JobStatus.CompletedSuccess, transcript: [{ createdAt: hoursAgo(0) }] }, NOW)).toBe(REFRESH_INTERVAL_SECONDS);
	});

	it("is slow when the latest Transcript entry is more than 6 hours old", () => {
		expect(chooseRefreshIntervalSeconds({ jobStatusId: JobStatus.Running, transcript: [{ createdAt: hoursAgo(7) }, { createdAt: hoursAgo(6.5) }] }, NOW)).toBe(
			REFRESH_INTERVAL_SECONDS
		);
	});

	it("is fast when only an older entry is stale but the latest is recent", () => {
		expect(chooseRefreshIntervalSeconds({ jobStatusId: JobStatus.InteractiveUser, transcript: [{ createdAt: hoursAgo(9) }, { createdAt: hoursAgo(0.1) }] }, NOW)).toBe(
			FAST_REFRESH_INTERVAL_SECONDS
		);
	});

	it("is fast for a non-terminal Job with no Transcript entries yet", () => {
		expect(chooseRefreshIntervalSeconds({ jobStatusId: JobStatus.Pending, transcript: [] }, NOW)).toBe(FAST_REFRESH_INTERVAL_SECONDS);
	});

	it("is slow before the Job has loaded", () => {
		expect(chooseRefreshIntervalSeconds(null, NOW)).toBe(REFRESH_INTERVAL_SECONDS);
	});
});
