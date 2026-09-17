import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeFixtureBrowser, type FixtureBrowser, openFixturePage } from "./_test/testPage.ts";
import { resolveElementAtPoint, resolveElementTarget, resolveViewportPoint } from "./targetResolver.ts";

let fixture: FixtureBrowser;

beforeAll(async () => {
	fixture = await openFixturePage();
});

afterAll(async () => {
	await closeFixtureBrowser(fixture);
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
