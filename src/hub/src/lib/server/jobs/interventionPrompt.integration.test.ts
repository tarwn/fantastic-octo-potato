import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendChatCompletion } from "../llm/llmClient";
import { getPendingCommand, reportCommandResult } from "../runner/interventionCommandActions";
import { useIntegrationTestDb } from "../storage/db/_test/integrationTestDb";

import { submitCommand, submitPromptCommand } from "./interventionActions";
import { assign, AUTH, RESULT_BODY, seedInteractiveJob, SHARED_SECRET } from "./interventionTestSeed";

vi.mock("../llm/llmClient", () => ({ sendChatCompletion: vi.fn() }));

const prompt = (overrides: Record<string, unknown> = {}) => ({ operatorId: "op-1", commandKey: "key-1", kind: "prompt", prompt: "Click the Save button", ...overrides });
const validStep = JSON.stringify({ id: "click_save", action: "click", args: [{ by: "text", value: "Save" }], intent: "Click Save" });

describe("submitPromptCommand", () => {
	const getDb = useIntegrationTestDb();

	beforeEach(() => {
		vi.mocked(sendChatCompletion).mockReset().mockResolvedValue(validStep);
	});

	it("converts the prompt to one atomic Step and serves it to the Runner, returning no Step values", async () => {
		const jobId = await seedInteractiveJob(getDb());

		const result = await submitPromptCommand(getDb(), String(jobId), prompt());

		expect(result.status).toBe(200);
		const { id } = (result.body as { data: { id: number } }).data;
		expect(sendChatCompletion).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(result.body)).not.toContain("args");
		expect(getPendingCommand(getDb(), "1", String(jobId), AUTH, SHARED_SECRET).body).toMatchObject({
			data: { id, kind: "prompt", payload: { step: { action: "click", args: [{ by: "text", value: "Save" }] } } }
		});
	});

	it("retries an invalid response, then persists the corrected Step", async () => {
		vi.mocked(sendChatCompletion).mockResolvedValueOnce("not json");
		const jobId = await seedInteractiveJob(getDb());

		expect((await submitPromptCommand(getDb(), String(jobId), prompt())).status).toBe(200);
		expect(sendChatCompletion).toHaveBeenCalledTimes(2);
	});

	it.each([
		["never valid", "not json"],
		["a Step that ends the run", JSON.stringify({ id: "done", action: "finish", args: [null] })]
	])("returns 422 and creates no command when the response is %s", async (_label, response) => {
		vi.mocked(sendChatCompletion).mockResolvedValue(response);
		const jobId = await seedInteractiveJob(getDb());

		expect((await submitPromptCommand(getDb(), String(jobId), prompt())).status).toBe(422);
		expect(getDb().prepare("SELECT COUNT(*) AS n FROM intervention_command").get()).toEqual({ n: 0 });
	});

	it("gives the model only the prompt, declared names, and masked Transcript", async () => {
		const jobId = await seedInteractiveJob(getDb());
		const first = submitCommand(getDb(), String(jobId), assign({ name: "secret", value: "hunter2" }));
		reportCommandResult(getDb(), "1", String(jobId), String((first.body as { data: { id: number } }).data.id), AUTH, SHARED_SECRET, RESULT_BODY);

		await submitPromptCommand(getDb(), String(jobId), prompt({ commandKey: "key-2" }));

		const request = JSON.stringify(vi.mocked(sendChatCompletion).mock.calls[0][0]);
		expect(request).toContain("Click the Save button");
		expect(request).toContain("secret");
		expect(request).not.toContain("hunter2");
	});

	it("returns the original command without another LLM call for a duplicate commandKey", async () => {
		const jobId = await seedInteractiveJob(getDb());
		const first = await submitPromptCommand(getDb(), String(jobId), prompt());

		const second = await submitPromptCommand(getDb(), String(jobId), prompt());

		expect((second.body as { data: { id: number } }).data.id).toBe((first.body as { data: { id: number } }).data.id);
		expect(sendChatCompletion).toHaveBeenCalledTimes(1);
	});

	it.each([
		["a different prompt under a reused commandKey", { prompt: "Other" }],
		["a non-owner replaying the key", { operatorId: "op-2" }]
	])("rejects %s with 409 without another LLM call", async (_label, overrides) => {
		const jobId = await seedInteractiveJob(getDb());
		await submitPromptCommand(getDb(), String(jobId), prompt());

		expect((await submitPromptCommand(getDb(), String(jobId), prompt(overrides))).status).toBe(409);
		expect(sendChatCompletion).toHaveBeenCalledTimes(1);
	});

	it.each([
		["a missing prompt", { prompt: " " }],
		["a missing operatorId", { operatorId: undefined }],
		["a missing commandKey", { commandKey: "" }]
	])("rejects %s with 400 without calling the LLM", async (_label, overrides) => {
		const jobId = await seedInteractiveJob(getDb());

		expect((await submitPromptCommand(getDb(), String(jobId), prompt(overrides))).status).toBe(400);
		expect(sendChatCompletion).not.toHaveBeenCalled();
	});
});
