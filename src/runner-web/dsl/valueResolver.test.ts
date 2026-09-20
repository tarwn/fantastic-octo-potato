import { describe, expect, it, vi } from "vitest";

import { DslActionError } from "./errors.ts";
import type { ExecutionContext } from "./executionContext.ts";
import { createOutputsState, setOutput } from "./outputsState.ts";
import { resolveStringValue, resolveValue } from "./valueResolver.ts";

function newContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
	return {
		ingredients: {},
		outputs: createOutputsState(),
		stepTimeoutMs: 1000,
		resolveCredential: vi.fn(() => "resolved-credential"),
		secrets: [],
		...overrides
	};
}

describe("resolveValue", () => {
	it("returns scalars unchanged", () => {
		expect(resolveValue("literal", newContext())).toBe("literal");
		expect(resolveValue(42, newContext())).toBe(42);
		expect(resolveValue(true, newContext())).toBe(true);
		expect(resolveValue(null, newContext())).toBeNull();
	});

	it("resolves an input reference from ingredients", () => {
		const ctx = newContext({ ingredients: { accountQuery: "ACCT-1042" } });
		expect(resolveValue({ ref: "input", name: "accountQuery" }, ctx)).toBe("ACCT-1042");
	});

	it("throws INPUT_NOT_FOUND when the ingredient was never provided", () => {
		const ctx = newContext();
		expect(() => resolveValue({ ref: "input", name: "missing" }, ctx)).toThrow(DslActionError);
	});

	it("resolves an assigned output, including a null value", () => {
		const ctx = newContext();
		setOutput(ctx.outputs, "balance", null);
		expect(resolveValue({ ref: "output", name: "balance" }, ctx)).toBeNull();
	});

	it("throws OUTPUT_NOT_ASSIGNED when the output has never been assigned", () => {
		const ctx = newContext();
		expect(() => resolveValue({ ref: "output", name: "balance" }, ctx)).toThrow(DslActionError);
	});

	it("resolves a credential via the runner-local resolver", () => {
		const resolveCredential = vi.fn(() => "the-password");
		const ctx = newContext({ resolveCredential });
		expect(resolveValue({ ref: "credential", name: "password" }, ctx)).toBe("the-password");
		expect(resolveCredential).toHaveBeenCalledWith("password");
	});

	it("propagates a credential resolver crash uncaught (let it crash, not a DslActionError)", () => {
		const ctx = newContext({
			resolveCredential: () => {
				throw new Error("RUNNER_CREDENTIAL_PASSWORD is not set");
			}
		});
		expect(() => resolveValue({ ref: "credential", name: "password" }, ctx)).toThrow(/RUNNER_CREDENTIAL_PASSWORD/);
		expect(() => resolveValue({ ref: "credential", name: "password" }, ctx)).not.toThrow(DslActionError);
	});
});

describe("resolveStringValue", () => {
	it("returns a literal string unchanged", () => {
		expect(resolveStringValue("hello", newContext())).toBe("hello");
	});

	it("coerces a resolved non-string scalar to a string", () => {
		const ctx = newContext({ ingredients: { count: 3 } });
		expect(resolveStringValue({ ref: "input", name: "count" }, ctx)).toBe("3");
	});

	it("throws NULL_STRING_VALUE when the resolved value is null", () => {
		const ctx = newContext();
		setOutput(ctx.outputs, "statementDate", null);
		expect(() => resolveStringValue({ ref: "output", name: "statementDate" }, ctx)).toThrow(DslActionError);
	});
});
