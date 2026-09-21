import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "../dsl/executionContext.ts";
import { createOutputsState, getOutput } from "../dsl/outputsState.ts";
import type { ChildStep, ReadSpec, Target } from "../dsl/types.ts";

import { closeFixtureBrowser, type FixtureBrowser, openFixturePage } from "./_test/testPage.ts";
import { executeAction } from "./actions.ts";

let fixture: FixtureBrowser;

function newContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
	return {
		ingredients: {},
		outputs: createOutputsState(),
		stepTimeoutMs: 300,
		resolveCredential: vi.fn(() => "resolved-credential"),
		secrets: [],
		...overrides
	};
}

beforeAll(async () => {
	fixture = await openFixturePage();
});

afterAll(async () => {
	await closeFixtureBrowser(fixture);
});

describe("executeAction: interaction", () => {
	it("open navigates the page", async () => {
		// Uses a throwaway page (not the shared fixture) so navigating away doesn't disturb the
		// fixture content the other tests in this file depend on.
		const page = await fixture.browser.newPage();
		try {
			const result = await executeAction(page, { id: "s", action: "open", args: ["about:blank"] }, newContext());
			expect(result).toMatchObject({ outcome: "succeeded", targetDescription: { component: "browser", selector: "" } });
			expect(page.url()).toBe("about:blank");
		}
		finally {
			await page.close();
		}
	});

	it("click clicks a resolved element target", async () => {
		const result = await executeAction(fixture.page, { id: "s", action: "click", args: [{ by: "css", value: "#accountType" }] }, newContext());
		expect(result).toMatchObject({ outcome: "succeeded" });
	});

	it("click clicks a point target without requiring an HTML match", async () => {
		const result = await executeAction(fixture.page, { id: "s", action: "click", args: [{ by: "point", x: 10, y: 10 }] }, newContext());
		expect(result).toMatchObject({ outcome: "succeeded" });
	});

	it("focus focuses the resolved element", async () => {
		const result = await executeAction(fixture.page, { id: "s", action: "focus", args: [{ by: "css", value: "#accountNumber" }] }, newContext());
		expect(result).toMatchObject({ outcome: "succeeded" });
		const isFocused = await fixture.page.locator("#accountNumber").evaluate((el) => el === document.activeElement);
		expect(isFocused).toBe(true);
	});

	it("fill replaces an input's contents with a resolved string value", async () => {
		const result = await executeAction(fixture.page, { id: "s", action: "fill", args: [{ by: "css", value: "#accountNumber" }, "ACCT-9999"] }, newContext());
		expect(result).toMatchObject({ outcome: "succeeded" });
		expect(await fixture.page.locator("#accountNumber").inputValue()).toBe("ACCT-9999");
		await executeAction(fixture.page, { id: "s", action: "fill", args: [{ by: "css", value: "#accountNumber" }, "ACCT-1042"] }, newContext());
	});

	it("select chooses a native option by value", async () => {
		const result = await executeAction(
			fixture.page,
			{ id: "s", action: "select", args: [{ by: "css", value: "#accountType" }, [{ by: "value", value: "savings" }]] },
			newContext()
		);
		expect(result).toMatchObject({ outcome: "succeeded" });
		expect(await fixture.page.locator("#accountType").inputValue()).toBe("savings");
	});

	it("scrollIntoView brings an off-screen target into view", async () => {
		await fixture.page.evaluate(() => window.scrollTo(0, 0));
		const result = await executeAction(fixture.page, { id: "s", action: "scrollIntoView", args: [{ by: "css", value: "#belowFold" }] }, newContext());
		expect(result).toMatchObject({ outcome: "succeeded" });
		const scrollY = await fixture.page.evaluate(() => window.scrollY);
		expect(scrollY).toBeGreaterThan(0);
	});

	it("scroll moves the viewport by the given deltas", async () => {
		await fixture.page.evaluate(() => window.scrollTo(0, 0));
		await fixture.page.mouse.move(400, 400);
		const result = await executeAction(fixture.page, { id: "s", action: "scroll", args: [0, 400] }, newContext());
		expect(result).toMatchObject({ outcome: "succeeded" });
		const scrollY = await fixture.page.evaluate(() => window.scrollY);
		expect(scrollY).toBeGreaterThan(0);
	});

	it("reports TARGET_NOT_FOUND, not a crash, when no element matches", async () => {
		const result = await executeAction(fixture.page, { id: "s", action: "click", args: [{ by: "css", value: "#does-not-exist" }] }, newContext());
		expect(result).toMatchObject({ outcome: "failed", error: { code: "TARGET_NOT_FOUND", message: expect.any(String) } });
	});

	it("clicks a target whose value is an input reference", async () => {
		const ctx = newContext({ ingredients: { selector: "#balance" } });
		const result = await executeAction(fixture.page, { id: "s", action: "click", args: [{ by: "css", value: { ref: "input", name: "selector" } }] }, ctx);
		expect(result.outcome).toBe("succeeded");
	});

	it("masks a sensitive resolved target value in the failure message and description", async () => {
		const ctx = newContext({ ingredients: { selector: "#secret-nope" }, secrets: ["#secret-nope"] });
		const result = await executeAction(fixture.page, { id: "s", action: "click", args: [{ by: "css", value: { ref: "input", name: "selector" } }] }, ctx);
		expect(result.outcome).toBe("failed");
		expect(JSON.stringify(result)).not.toContain("#secret-nope");
	});

	it("reports TARGET_AMBIGUOUS, never a silent first-match pick", async () => {
		const result = await executeAction(fixture.page, { id: "s", action: "click", args: [{ by: "css", value: ".duplicate" }] }, newContext());
		expect(result).toMatchObject({ outcome: "failed", error: { code: "TARGET_AMBIGUOUS", message: expect.any(String) } });
	});

	it("reports ACTION_FAILED, not a crash, when a resolved element is never actionable", async () => {
		// #hidden resolves to exactly one element, but it's display:none, so Playwright's click
		// actionability wait times out — that's an ordinary reported failure, not a technical crash.
		fixture.page.setDefaultTimeout(200);
		try {
			const result = await executeAction(fixture.page, { id: "s", action: "click", args: [{ by: "css", value: "#hidden" }] }, newContext());
			expect(result).toMatchObject({ outcome: "failed", error: { code: "ACTION_FAILED", message: expect.any(String) } });
		}
		finally {
			fixture.page.setDefaultTimeout(30000);
		}
	});
});

describe("executeAction: read/assign", () => {
	describe("structured read", () => {
		const amountSpec = (overrides: Partial<ReadSpec> = {}, group: number | string = "amount"): ReadSpec => ({
			source: "text",
			extract: { by: "regex", pattern: "Amount:\\s*(?<amount>\\S+)", group },
			...overrides
		});
		const readStep = (target: Target, spec: ReadSpec): ChildStep => ({ id: "s", action: "read", args: [target, spec, { ref: "output", name: "amount" }] });
		const invoiceTarget: Target = { by: "text", value: "Amount:", exact: false };

		it("extracts a named group from a substring-matched paragraph and keeps the formatting", async () => {
			const ctx = newContext();
			const result = await executeAction(fixture.page, readStep(invoiceTarget, amountSpec()), ctx);
			expect(result).toMatchObject({ outcome: "succeeded", extraction: { fieldName: "amount", value: "$1200.00" } });
			expect(getOutput(ctx.outputs, "amount")).toBe("$1200.00");
		});

		it("extracts a numbered group", async () => {
			const result = await executeAction(fixture.page, readStep(invoiceTarget, amountSpec({}, 1)), newContext());
			expect(result).toMatchObject({ outcome: "succeeded", extraction: { value: "$1200.00" } });
		});

		it("reports the requested substring, never the element's text", async () => {
			const result = await executeAction(fixture.page, readStep(invoiceTarget, amountSpec()), newContext());
			expect(result.targetDescription).toEqual({ component: "element", selector: "text contains 'Amount:'" });
			for (const pageText of ["$1200.00", "$75.00", "$0.00"]) {
				expect(JSON.stringify(result.targetDescription)).not.toContain(pageText);
			}
		});

		it("reports an empty selector when the requested substring matches a secret", async () => {
			const result = await executeAction(fixture.page, readStep(invoiceTarget, amountSpec()), newContext({ secrets: ["Amount:"] }));
			expect(result).toMatchObject({ outcome: "succeeded", targetDescription: { component: "element", selector: "" } });
		});

		it("keeps the exact-target description unchanged", async () => {
			const result = await executeAction(fixture.page, readStep({ by: "text", value: "Total: $0.00" }, amountSpec({}, 0)), newContext());
			expect(result.targetDescription.selector).toBe("id='invoiceTotal'");
		});

		it("matches a substring case-insensitively across normalized whitespace", async () => {
			const target: Target = { by: "text", value: "sales   TAX", exact: false };
			const spec: ReadSpec = { source: "text", extract: { by: "regex", pattern: "Tax:\\s*(\\S+)", group: 1 } };
			const result = await executeAction(fixture.page, readStep(target, spec), newContext());
			expect(result).toMatchObject({ outcome: "succeeded", extraction: { value: "$75.00" } });
		});

		it("fails an ambiguous substring target without assigning an output", async () => {
			const ctx = newContext();
			const result = await executeAction(fixture.page, readStep({ by: "text", value: "$", exact: false }, amountSpec()), ctx);
			expect(result).toMatchObject({ outcome: "failed", error: { code: "TARGET_AMBIGUOUS" } });
			expect(() => getOutput(ctx.outputs, "amount")).toThrow("has not been assigned");
		});

		it("turns <br> into newlines for element text sources", async () => {
			const spec: ReadSpec = { source: "text", extract: { by: "regex", pattern: "Ref: (\\S+)\\nOwner: (\\w+)", group: 2 } };
			const result = await executeAction(fixture.page, readStep({ by: "css", value: "#twoLines" }, spec), newContext());
			expect(result).toMatchObject({ outcome: "succeeded", extraction: { value: "Pat" } });
		});

		it("extracts from a value source", async () => {
			const spec: ReadSpec = { source: "value", extract: { by: "regex", pattern: "ACCT-(\\d+)", group: 1 } };
			const result = await executeAction(fixture.page, readStep({ by: "css", value: "#accountNumber" }, spec), newContext());
			expect(result).toMatchObject({ outcome: "succeeded", extraction: { value: "1042" } });
		});

		it("parses the capture as a number when asked", async () => {
			const spec: ReadSpec = { source: "text", parse: "number", extract: { by: "regex", pattern: "Tax: \\$(\\S+)", group: 1 } };
			const result = await executeAction(fixture.page, readStep({ by: "css", value: "#invoiceTax" }, spec), newContext());
			expect(result).toMatchObject({ outcome: "succeeded", extraction: { value: 75 } });
		});

		it("fails INVALID_NUMBER without echoing the capture or assigning an output", async () => {
			const ctx = newContext();
			const result = await executeAction(fixture.page, readStep(invoiceTarget, amountSpec({ parse: "number" })), ctx);
			expect(result).toMatchObject({ outcome: "failed", error: { code: "INVALID_NUMBER" } });
			expect(result.error?.message).not.toContain("1200");
			expect(() => getOutput(ctx.outputs, "amount")).toThrow("has not been assigned");
		});

		it("fails with an extraction error and assigns nothing when the pattern does not match", async () => {
			const ctx = newContext();
			const spec: ReadSpec = { source: "text", extract: { by: "regex", pattern: "Nope: (\\S+)", group: 1 } };
			const result = await executeAction(fixture.page, readStep(invoiceTarget, spec), ctx);
			expect(result).toMatchObject({ outcome: "failed", error: { code: "EXTRACTION_NOT_FOUND" } });
			expect(() => getOutput(ctx.outputs, "amount")).toThrow("has not been assigned");
		});

		it("rejects a malformed dispatched spec before resolving the target", async () => {
			const bad = { source: "text", extract: { by: "regex", pattern: "(a)", group: -1 } } as ReadSpec;
			const result = await executeAction(fixture.page, readStep({ by: "css", value: "#does-not-exist" }, bad), newContext());
			expect(result).toMatchObject({ outcome: "failed", error: { code: "INVALID_EXTRACTION_PATTERN" } });
		});

		it("extracts at a point using textContent", async () => {
			const result = await executeAction(fixture.page, readStep({ by: "point", x: 205, y: 1805 }, { source: "text", extract: { by: "regex", pattern: "Below the (\\w+)", group: 1 } }), newContext());
			expect(result).toMatchObject({ outcome: "succeeded", extraction: { value: "fold" } });
		});

		it("extracts a value at a point", async () => {
			const result = await executeAction(fixture.page, readStep({ by: "point", x: 205, y: 1905 }, { source: "value", extract: { by: "regex", pattern: "deep-(\\w+)", group: 1 } }), newContext());
			expect(result).toMatchObject({ outcome: "succeeded", extraction: { value: "value" } });
		});

		it("fails a value source at a point with no value-bearing control", async () => {
			const result = await executeAction(fixture.page, readStep({ by: "point", x: 205, y: 1805 }, { source: "value", extract: { by: "regex", pattern: "(a)", group: 1 } }), newContext());
			expect(result).toMatchObject({ outcome: "failed", error: { code: "TARGET_NOT_FOUND" } });
		});
	});

	it("read text copies innerText into the destination output", async () => {
		const ctx = newContext();
		const result = await executeAction(fixture.page, { id: "s", action: "read", args: [{ by: "css", value: "#balance" }, "text", { ref: "output", name: "balance" }] }, ctx);
		expect(result).toMatchObject({ outcome: "succeeded", extraction: { fieldName: "balance", value: "1234.50" } });
		expect(getOutput(ctx.outputs, "balance")).toBe("1234.50");
	});

	it("read value copies the raw input value into the destination output", async () => {
		const ctx = newContext();
		const result = await executeAction(fixture.page, { id: "s", action: "read", args: [{ by: "css", value: "#accountNumber" }, "value", { ref: "output", name: "accountNumber" }] }, ctx);
		expect(result).toMatchObject({ outcome: "succeeded", extraction: { fieldName: "accountNumber", value: "ACCT-1042" } });
	});

	it("read number parses the control value into a number", async () => {
		const ctx = newContext();
		const result = await executeAction(fixture.page, { id: "s", action: "read", args: [{ by: "css", value: "#balance" }, "number", { ref: "output", name: "balance" }] }, ctx);
		expect(result).toMatchObject({ outcome: "succeeded", extraction: { fieldName: "balance", value: 1234.5 } });
	});

	it("read number on an unparsable string fails with INVALID_NUMBER", async () => {
		const result = await executeAction(fixture.page, { id: "s", action: "read", args: [{ by: "text", value: "Search" }, "number", { ref: "output", name: "x" }] }, newContext());
		expect(result).toMatchObject({ outcome: "failed", error: { code: "INVALID_NUMBER", message: expect.any(String) } });
	});

	it("read number on an empty string assigns null", async () => {
		const ctx = newContext();
		const result = await executeAction(fixture.page, { id: "s", action: "read", args: [{ by: "css", value: "#notes" }, "number", { ref: "output", name: "notes" }] }, ctx);
		expect(result).toMatchObject({ outcome: "succeeded", extraction: { fieldName: "notes", value: null } });
	});

	it("read at a point outside the document fails with TARGET_NOT_FOUND", async () => {
		const result = await executeAction(fixture.page, { id: "s", action: "read", args: [{ by: "point", x: 5000, y: 30 }, "text", { ref: "output", name: "x" }] }, newContext());
		expect(result).toMatchObject({ outcome: "failed", error: { code: "TARGET_NOT_FOUND", message: expect.any(String) } });
	});

	it("read value at a point resolves the underlying HTML value-bearing control", async () => {
		const ctx = newContext();
		const result = await executeAction(fixture.page, { id: "s", action: "read", args: [{ by: "point", x: 205, y: 1905 }, "value", { ref: "output", name: "deep" }] }, ctx);
		expect(result).toMatchObject({ outcome: "succeeded", extraction: { fieldName: "deep", value: "deep-value" } });
	});

	it("read value at a point fails when nothing there has a value to read", async () => {
		const result = await executeAction(fixture.page, { id: "s", action: "read", args: [{ by: "point", x: 205, y: 1805 }, "value", { ref: "output", name: "deep" }] }, newContext());
		expect(result).toMatchObject({ outcome: "failed", error: { code: "TARGET_NOT_FOUND", message: expect.any(String) } });
	});

	it("read text at a point falls back to the element's displayed text", async () => {
		const ctx = newContext();
		const result = await executeAction(fixture.page, { id: "s", action: "read", args: [{ by: "point", x: 205, y: 1805 }, "text", { ref: "output", name: "belowFold" }] }, ctx);
		expect(result).toMatchObject({ outcome: "succeeded", extraction: { fieldName: "belowFold", value: "Below the fold" } });
	});

	it("read number at a point prefers the resolved control's own value", async () => {
		const ctx = newContext();
		const result = await executeAction(fixture.page, { id: "s", action: "read", args: [{ by: "point", x: 205, y: 1905 }, "number", { ref: "output", name: "deepNumber" }] }, ctx);
		expect(result).toMatchObject({ outcome: "failed", error: { code: "INVALID_NUMBER", message: expect.any(String) } });
	});

	it("assign resolves a scalar value and records it as an output, including null", async () => {
		const ctx = newContext();
		const result = await executeAction(fixture.page, { id: "s", action: "assign", args: [{ ref: "output", name: "status" }, "found"] }, ctx);
		expect(result).toMatchObject({ outcome: "succeeded", extraction: { fieldName: "status", value: "found" } });

		const nullResult = await executeAction(fixture.page, { id: "s", action: "assign", args: [{ ref: "output", name: "extra" }, null] }, ctx);
		expect(nullResult).toMatchObject({ outcome: "succeeded", extraction: { fieldName: "extra", value: null } });
	});
});

describe("executeAction: check/verify/goto/finish/fail", () => {
	it("check reports the boolean answer without failing when false", async () => {
		const result = await executeAction(fixture.page, { id: "s", action: "check", args: [{ test: "exists", args: [{ by: "css", value: "#nope" }] }] }, newContext());
		expect(result).toMatchObject({ outcome: "succeeded", checked: false });
	});

	it("verify succeeds once the condition becomes true within stepTimeoutMs", async () => {
		const step: ChildStep = { id: "s", action: "verify", args: [{ test: "visible", args: [{ by: "css", value: "#accountNumber" }] }] };
		const result = await executeAction(fixture.page, step, newContext());
		expect(result).toMatchObject({ outcome: "succeeded" });
	});

	it("verify fails with VERIFY_TIMEOUT when the condition never becomes true", async () => {
		const step: ChildStep = { id: "s", action: "verify", args: [{ test: "exists", args: [{ by: "css", value: "#never-appears" }] }] };
		const result = await executeAction(fixture.page, step, newContext({ stepTimeoutMs: 150 }));
		expect(result).toMatchObject({ outcome: "failed", error: { code: "VERIFY_TIMEOUT", message: expect.any(String) } });
	});

	it("goto reports the jump target without touching the page", async () => {
		const result = await executeAction(fixture.page, { id: "s", action: "goto", args: ["complete"] }, newContext());
		expect(result).toMatchObject({ outcome: "succeeded", gotoStepId: "complete" });
	});

	it("finish with a null checkpoint always succeeds finished", async () => {
		const result = await executeAction(fixture.page, { id: "s", action: "finish", args: [null] }, newContext());
		expect(result).toMatchObject({ outcome: "succeeded", finished: true });
	});

	it("finish evaluates its checkpoint condition", async () => {
		const step: ChildStep = { id: "s", action: "finish", args: [{ test: "exists", args: [{ by: "css", value: "#nope" }] }] };
		const result = await executeAction(fixture.page, step, newContext());
		expect(result).toMatchObject({ outcome: "succeeded", finished: false });
	});

	it("fail reports a businessFailure outcome with its code/message", async () => {
		const result = await executeAction(fixture.page, { id: "s", action: "fail", args: ["UNKNOWN_RESULT", "No recognized search outcome"] }, newContext());
		expect(result).toMatchObject({ outcome: "failed", kind: "businessFailure", error: { code: "UNKNOWN_RESULT", message: "No recognized search outcome" } });
	});
});

describe("executeAction: targetDescription", () => {
	it("describes the resolved element of a click", async () => {
		const result = await executeAction(fixture.page, { id: "s", action: "click", args: [{ by: "css", value: "#accountType" }] }, newContext());
		expect(result.targetDescription).toEqual({ component: "Dropdown", selector: "id='accountType'" });
	});

	it("never puts a filled or read value in the description", async () => {
		const filled = await executeAction(fixture.page, { id: "s", action: "fill", args: [{ by: "css", value: "#accountNumber" }, "ACCT-7777"] }, newContext());
		expect(JSON.stringify(filled.targetDescription)).not.toContain("ACCT-7777");
		const read = await executeAction(fixture.page, { id: "s", action: "read", args: [{ by: "css", value: "#accountNumber" }, "value", { ref: "output", name: "n" }] }, newContext());
		expect(JSON.stringify(read.targetDescription)).not.toContain("ACCT-7777");
		await executeAction(fixture.page, { id: "s", action: "fill", args: [{ by: "css", value: "#accountNumber" }, "ACCT-1042"] }, newContext());
	});

	it("skips a candidate the Job's known secrets would mask", async () => {
		const result = await executeAction(fixture.page, { id: "s", action: "focus", args: [{ by: "css", value: "#accountNumber" }] }, newContext({ secrets: ["accountNumber"] }));
		expect(result.targetDescription).toEqual({ component: "text input", selector: "label='Account number'" });
	});

	it("reports the generic description for an action with no element target", async () => {
		const result = await executeAction(fixture.page, { id: "s", action: "goto", args: ["elsewhere"] }, newContext());
		expect(result.targetDescription).toEqual({ component: "element", selector: "" });
	});

	it("reports the generic description when the target could not be resolved", async () => {
		const result = await executeAction(fixture.page, { id: "s", action: "click", args: [{ by: "css", value: "#does-not-exist" }] }, newContext());
		expect(result.targetDescription).toEqual({ component: "element", selector: "" });
	});
});
