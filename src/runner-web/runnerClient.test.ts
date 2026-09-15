import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RunnerConfig } from "./config.ts";
import { initRunner, pollRunner } from "./runnerClient.ts";

const config: RunnerConfig = {
	hubUrl: "http://localhost:4173",
	runnerId: "1",
	runnerSharedSecret: "the-secret"
};

beforeEach(() => {
	vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("initRunner", () => {
	it("posts to the init endpoint with bearer auth and returns the interval/timeout", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(
			new Response(JSON.stringify({ data: { pollIntervalSeconds: 30, interventionTimeoutSeconds: 300 } }), { status: 200 })
		);

		const result = await initRunner(config);

		expect(fetchMock).toHaveBeenCalledWith("http://localhost:4173/api/runner/runners/1/init", {
			method: "POST",
			headers: { authorization: "Bearer the-secret" }
		});
		expect(result).toEqual({ pollIntervalSeconds: 30, interventionTimeoutSeconds: 300 });
	});

	it("throws with the hub error message when the response is not ok", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }));

		await expect(initRunner(config)).rejects.toThrow(/401.*Unauthorized/);
	});
});

describe("pollRunner", () => {
	it("posts to the poll endpoint with bearer auth and returns hasWork", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { hasWork: false } }), { status: 200 }));

		const result = await pollRunner(config);

		expect(fetchMock).toHaveBeenCalledWith("http://localhost:4173/api/runner/runners/1/poll", {
			method: "POST",
			headers: { authorization: "Bearer the-secret" }
		});
		expect(result).toEqual({ hasWork: false });
	});

	it("throws with the hub error message when the response is not ok", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }));

		await expect(pollRunner(config)).rejects.toThrow(/401.*Unauthorized/);
	});
});
