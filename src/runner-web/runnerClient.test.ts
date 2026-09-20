import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RunnerConfig } from "./config.ts";
import { fetchPendingCommand, initRunner, pollRunner, reportCommandResult, reportDslStep, RunnerHttpError } from "./runnerClient.ts";

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

describe("reportDslStep", () => {
	it("posts to the steps endpoint with bearer auth and the reported dslStep body", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(
			new Response(JSON.stringify({ data: { jobStatusId: 2, nextStep: { id: "next", action: "click", args: [{ by: "css", value: "#go" }] } } }), {
				status: 200
			})
		);

		const result = await reportDslStep(config, 42, { stepId: "s1", outcome: "succeeded", extractions: [], targetDescription: { component: "element", selector: "" } });

		expect(fetchMock).toHaveBeenCalledWith("http://localhost:4173/api/runner/runners/1/jobs/42/steps", {
			method: "POST",
			headers: { authorization: "Bearer the-secret", "content-type": "application/json" },
			body: JSON.stringify({ kind: "dslStep", stepId: "s1", outcome: "succeeded", extractions: [], targetDescription: { component: "element", selector: "" } })
		});
		expect(result).toEqual({ jobStatusId: 2, nextStep: { id: "next", action: "click", args: [{ by: "css", value: "#go" }] } });
	});

	it("throws a RunnerHttpError carrying the status when the response is not ok", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "not the owner" }), { status: 403 }));

		const error = await reportDslStep(config, 42, { stepId: "s1", outcome: "succeeded", extractions: [], targetDescription: { component: "element", selector: "" } }).catch((err: unknown) => err);

		expect(error).toBeInstanceOf(RunnerHttpError);
		expect((error as RunnerHttpError).status).toBe(403);
		expect((error as Error).message).toMatch(/403.*not the owner/);
	});
});

describe("fetchPendingCommand", () => {
	it("gets the Job's pending command with bearer auth", async () => {
		const command = { id: 7, stepId: "intervention-7", kind: "click", payload: { x: 1, y: 2 } };
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: command }), { status: 200 }));

		const result = await fetchPendingCommand(config, 42);

		expect(fetchMock).toHaveBeenCalledWith("http://localhost:4173/api/runner/runners/1/jobs/42/commands/pending", { headers: { authorization: "Bearer the-secret" } });
		expect(result).toEqual(command);
	});

	it("returns null when nothing is pending", async () => {
		vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: null }), { status: 200 }));

		expect(await fetchPendingCommand(config, 42)).toBeNull();
	});

	it("throws a RunnerHttpError carrying the status when the response is not ok", async () => {
		vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: "not the owner" }), { status: 403 }));

		const error = await fetchPendingCommand(config, 42).catch((err: unknown) => err);

		expect(error).toBeInstanceOf(RunnerHttpError);
		expect((error as RunnerHttpError).status).toBe(403);
	});
});

describe("reportCommandResult", () => {
	const result = { outcome: "succeeded", targetDescription: { component: "element", selector: "" } } as const;

	it("posts the result to the command's endpoint and reports it accepted", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { jobStatusId: 8 } }), { status: 200 }));

		expect(await reportCommandResult(config, 42, 7, result)).toBe(true);
		expect(fetchMock).toHaveBeenCalledWith("http://localhost:4173/api/runner/runners/1/jobs/42/commands/7/result", {
			method: "POST",
			headers: { authorization: "Bearer the-secret", "content-type": "application/json" },
			body: JSON.stringify(result)
		});
	});

	it("reports a 409 as not accepted so the caller discards the result", async () => {
		vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: "not pending" }), { status: 409 }));

		expect(await reportCommandResult(config, 42, 7, result)).toBe(false);
	});

	it("throws a RunnerHttpError for any other failure", async () => {
		vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: "boom" }), { status: 500 }));

		const error = await reportCommandResult(config, 42, 7, result).catch((err: unknown) => err);

		expect(error).toBeInstanceOf(RunnerHttpError);
		expect((error as RunnerHttpError).status).toBe(500);
	});
});
