import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeFixtureBrowser, type FixtureBrowser, openFixturePage } from "./_test/testPage.ts";
import { evaluateCondition } from "./conditions.ts";
import { DslActionError } from "./errors.ts";
import type { ExecutionContext } from "./executionContext.ts";
import { createOutputsState, setOutput } from "./outputsState.ts";

let fixture: FixtureBrowser;

function newContext(): ExecutionContext {
	return {
		ingredients: {},
		outputs: createOutputsState(),
		stepTimeoutMs: 1000,
		resolveCredential: () => {
			throw new Error("not used in this test");
		}
	};
}

beforeAll(async () => {
	fixture = await openFixturePage();
});

afterAll(async () => {
	await closeFixtureBrowser(fixture);
});

describe("evaluateCondition", () => {
	it("exists is true for any match, even when there are multiple", async () => {
		const result = await evaluateCondition(fixture.page, { test: "exists", args: [{ by: "css", value: ".duplicate" }] }, newContext());
		expect(result).toBe(true);
	});

	it("exists is false for zero matches", async () => {
		const result = await evaluateCondition(fixture.page, { test: "exists", args: [{ by: "css", value: "#nope" }] }, newContext());
		expect(result).toBe(false);
	});

	it("visible is true for a visible element", async () => {
		const result = await evaluateCondition(fixture.page, { test: "visible", args: [{ by: "css", value: "#balance" }] }, newContext());
		expect(result).toBe(true);
	});

	it("visible is false for a hidden element", async () => {
		const result = await evaluateCondition(fixture.page, { test: "visible", args: [{ by: "css", value: "#hidden" }] }, newContext());
		expect(result).toBe(false);
	});

	it("visible is false when the element is entirely absent", async () => {
		const result = await evaluateCondition(fixture.page, { test: "visible", args: [{ by: "css", value: "#nope" }] }, newContext());
		expect(result).toBe(false);
	});

	it("rejects a point target for a state test — points only support click/read", async () => {
		await expect(
			evaluateCondition(fixture.page, { test: "exists", args: [{ by: "point", x: 10, y: 10 }] }, newContext())
		).rejects.toThrow(DslActionError);
	});

	it("throws TARGET_AMBIGUOUS when a state test matches more than one element", async () => {
		await expect(evaluateCondition(fixture.page, { test: "visible", args: [{ by: "css", value: ".duplicate" }] }, newContext())).rejects.toThrow(
			DslActionError
		);
	});

	it("enabled/disabled report the element's actual state", async () => {
		const disabled = await evaluateCondition(fixture.page, { test: "disabled", args: [{ by: "css", value: "#save" }] }, newContext());
		const enabled = await evaluateCondition(fixture.page, { test: "enabled", args: [{ by: "css", value: "#save" }] }, newContext());
		expect(disabled).toBe(true);
		expect(enabled).toBe(false);
	});

	it("assigned is false until an output has been set, true afterward, including null", async () => {
		const ctx = newContext();
		expect(await evaluateCondition(fixture.page, { test: "assigned", args: [{ ref: "output", name: "balance" }] }, ctx)).toBe(false);

		setOutput(ctx.outputs, "balance", null);
		expect(await evaluateCondition(fixture.page, { test: "assigned", args: [{ ref: "output", name: "balance" }] }, ctx)).toBe(true);
	});

	it("all requires every listed condition to be true", async () => {
		const ctx = newContext();
		const allTrue = await evaluateCondition(
			fixture.page,
			{ test: "all", args: [{ test: "visible", args: [{ by: "css", value: "#balance" }] }, { test: "exists", args: [{ by: "text", value: "Search" }] }] },
			ctx
		);
		expect(allTrue).toBe(true);

		const oneFalse = await evaluateCondition(
			fixture.page,
			{ test: "all", args: [{ test: "visible", args: [{ by: "css", value: "#hidden" }] }, { test: "exists", args: [{ by: "text", value: "Search" }] }] },
			ctx
		);
		expect(oneFalse).toBe(false);
	});

	it("any requires at least one listed condition to be true", async () => {
		const ctx = newContext();
		const result = await evaluateCondition(
			fixture.page,
			{ test: "any", args: [{ test: "visible", args: [{ by: "css", value: "#hidden" }] }, { test: "exists", args: [{ by: "text", value: "Search" }] }] },
			ctx
		);
		expect(result).toBe(true);

		const noneTrue = await evaluateCondition(
			fixture.page,
			{ test: "any", args: [{ test: "visible", args: [{ by: "css", value: "#hidden" }] }, { test: "exists", args: [{ by: "css", value: "#nope" }] }] },
			ctx
		);
		expect(noneTrue).toBe(false);
	});
});
