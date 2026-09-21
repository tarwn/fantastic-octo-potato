import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ExecutionContext } from "../dsl/executionContext.ts";
import { createOutputsState } from "../dsl/outputsState.ts";

import { closeFixtureBrowser, type FixtureBrowser, openFixturePage } from "./_test/testPage.ts";
import { resolveElementAtPoint, resolveElementTarget, resolveTargetValue, resolveViewportPoint } from "./targetResolver.ts";

let fixture: FixtureBrowser;

beforeAll(async () => {
	fixture = await openFixturePage();
});

afterAll(async () => {
	await closeFixtureBrowser(fixture);
});

describe("resolveTargetValue", () => {
	const ctx = (): ExecutionContext => ({
		ingredients: { search: "Search" },
		outputs: createOutputsState(),
		stepTimeoutMs: 300,
		resolveCredential: () => "unused",
		secrets: []
	});

	it("keeps a literal value", () => {
		expect(resolveTargetValue({ by: "text", value: "Search" }, ctx())).toEqual({ by: "text", value: "Search" });
	});

	it("resolves an input reference to the supplied ingredient", async () => {
		const resolved = resolveTargetValue({ by: "text", value: { ref: "input", name: "search" } }, ctx());

		expect((await resolveElementTarget(fixture.page, resolved)).status).toBe("found");
	});

	it("throws when the referenced input was not provided", () => {
		expect(() => resolveTargetValue({ by: "text", value: { ref: "input", name: "missing" } }, ctx())).toThrow("Input \"missing\" was not provided");
	});
});

describe("resolveElementTarget", () => {
	it("resolves a text target with exactly one match", async () => {
		const result = await resolveElementTarget(fixture.page, { by: "text", value: "Search" });
		expect(result.status).toBe("found");
	});

	it("resolves a label target with exactly one match", async () => {
		const result = await resolveElementTarget(fixture.page, { by: "label", value: "Account number" });
		expect(result.status).toBe("found");
		if (result.status === "found") {
			expect(await result.locator.inputValue()).toBe("ACCT-1042");
		}
	});

	describe("label targets against BambooInvoice login markup", () => {
		let loginPage: Page;

		beforeAll(async () => {
			loginPage = await fixture.browser.newPage();
			await loginPage.setContent(`
				<form>
					<p><label for="username"><span>Email:</span></label> <input type="text" id="username"></p>
					<p><label for="password"><span>Password:</span></label> <input type="password" id="password"></p>
					<p><label for="confirm"><span>Confirm password:</span></label> <input type="password" id="confirm"></p>
				</form>`);
		});

		afterAll(async () => {
			await loginPage.close();
		});

		it.each([["Email"], ["Email:"], ["  email "], ["EMAIL:"]])("finds the input for label %j despite the trailing colon and case", async (value) => {
			const result = await resolveElementTarget(loginPage, { by: "label", value });
			expect(result.status).toBe("found");
			if (result.status === "found") {
				await result.locator.fill("someone@example.com");
				expect(await result.locator.inputValue()).toBe("someone@example.com");
			}
		});

		it("does not match a label that merely contains the value", async () => {
			const result = await resolveElementTarget(loginPage, { by: "label", value: "Pass" });
			expect(result.status).toBe("missing");
		});

		it("treats regex characters in the value literally", async () => {
			const result = await resolveElementTarget(loginPage, { by: "label", value: "Email.*" });
			expect(result.status).toBe("missing");
		});
	});

	describe("text substring (exact: false)", () => {
		it("finds one element by a case-insensitive, whitespace-normalized substring", async () => {
			const resolved = resolveTargetValue({ by: "text", value: "sales   TAX", exact: false }, { ingredients: {}, outputs: createOutputsState(), stepTimeoutMs: 300, resolveCredential: () => "unused", secrets: [] });
			expect(resolved).toEqual({ by: "text", value: "sales   TAX", exact: false });
			expect((await resolveElementTarget(fixture.page, resolved)).status).toBe("found");
		});

		it("does not match a substring when exact is true or omitted", async () => {
			expect((await resolveElementTarget(fixture.page, { by: "text", value: "Sales Tax" })).status).toBe("missing");
			expect((await resolveElementTarget(fixture.page, { by: "text", value: "Sales Tax", exact: true })).status).toBe("missing");
		});

		it("reports ambiguous when the substring matches several elements", async () => {
			expect((await resolveElementTarget(fixture.page, { by: "text", value: "$", exact: false })).status).toBe("ambiguous");
		});
	});

	it("resolves a placeholder target with exactly one match", async () => {
		const result = await resolveElementTarget(fixture.page, { by: "placeholder", value: "Search accounts" });
		expect(result.status).toBe("found");
	});

	it("resolves a css target with exactly one match", async () => {
		const result = await resolveElementTarget(fixture.page, { by: "css", value: "#balance" });
		expect(result.status).toBe("found");
	});

	it("reports missing when no element matches", async () => {
		const result = await resolveElementTarget(fixture.page, { by: "css", value: "#does-not-exist" });
		expect(result).toEqual({ status: "missing" });
	});

	it("reports ambiguous when more than one element matches", async () => {
		const result = await resolveElementTarget(fixture.page, { by: "css", value: ".duplicate" });
		expect(result).toEqual({ status: "ambiguous", count: 2 });
	});
});

describe("resolveViewportPoint", () => {
	it("scrolls a below-the-fold point into the viewport and returns viewport-relative coordinates", async () => {
		const { viewportX, viewportY } = await resolveViewportPoint(fixture.page, { by: "point", x: 200, y: 1800 });
		expect(viewportX).toBe(200);
		expect(viewportY).toBeGreaterThanOrEqual(0);
		expect(viewportY).toBeLessThanOrEqual(800);
	});
});

describe("resolveElementAtPoint", () => {
	it("resolves the HTML element at a full-page point below the fold", async () => {
		const element = await resolveElementAtPoint(fixture.page, { by: "point", x: 205, y: 1805 });
		expect(element).toBeDefined();
		const id = await element?.evaluate((el) => el.id);
		expect(id).toBe("belowFold");
	});

	it("returns undefined when the point falls outside the viewport", async () => {
		// x is far wider than the 1280px fixture viewport, so no element sits at that viewport
		// coordinate even after scrolling for y.
		const element = await resolveElementAtPoint(fixture.page, { by: "point", x: 5000, y: 30 });
		expect(element).toBeUndefined();
	});
});
