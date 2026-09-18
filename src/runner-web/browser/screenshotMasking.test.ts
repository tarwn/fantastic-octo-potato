import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeFixtureBrowser, type FixtureBrowser, openFixturePage } from "./_test/testPage.ts";
import { takeMaskedScreenshot } from "./screenshotMasking.ts";

let fixture: FixtureBrowser;

beforeAll(async () => {
	fixture = await openFixturePage();
});

afterAll(async () => {
	await closeFixtureBrowser(fixture);
});

describe("takeMaskedScreenshot", () => {
	it("returns a plain screenshot when there are no secrets to mask", async () => {
		const withoutMasking = await fixture.page.screenshot();
		const result = await takeMaskedScreenshot(fixture.page, []);
		expect(result.equals(withoutMasking)).toBe(true);
	});

	it("overlays elements whose text or control value matches a known secret, then removes the overlay", async () => {
		const withoutMasking = await fixture.page.screenshot();
		const masked = await takeMaskedScreenshot(fixture.page, ["1234.50", "ACCT-1042"]);

		expect(masked.equals(withoutMasking)).toBe(false);
		// The overlay is added and removed within the call — nothing should be left behind on the page.
		expect(await fixture.page.locator("#__dsl_mask_overlay__").count()).toBe(0);
	});

	it("ignores empty-string secrets rather than matching every element", async () => {
		const withoutMasking = await fixture.page.screenshot();
		const result = await takeMaskedScreenshot(fixture.page, [""]);
		expect(result.equals(withoutMasking)).toBe(true);
		expect(await fixture.page.locator("#__dsl_mask_overlay__").count()).toBe(0);
	});

	it("masks an element whose text matches a PII pattern even when it isn't a known secret", async () => {
		await fixture.page.evaluate(() => {
			const el = document.createElement("div");
			el.id = "__pii_test_element__";
			el.textContent = "jane.doe@example.com";
			document.body.appendChild(el);
		});
		try {
			const withoutMasking = await fixture.page.screenshot();
			const masked = await takeMaskedScreenshot(fixture.page, []);

			expect(masked.equals(withoutMasking)).toBe(false);
			expect(await fixture.page.locator("#__dsl_mask_overlay__").count()).toBe(0);
		}
		finally {
			await fixture.page.evaluate(() => document.getElementById("__pii_test_element__")?.remove());
		}
	});

	it("leaves ordinary non-sensitive text unmasked", async () => {
		await fixture.page.evaluate(() => {
			const el = document.createElement("div");
			el.id = "__ordinary_test_element__";
			el.textContent = "Checking account";
			document.body.appendChild(el);
		});
		try {
			const withoutMasking = await fixture.page.screenshot();
			const masked = await takeMaskedScreenshot(fixture.page, []);

			expect(masked.equals(withoutMasking)).toBe(true);
			expect(await fixture.page.locator("#__dsl_mask_overlay__").count()).toBe(0);
		}
		finally {
			await fixture.page.evaluate(() => document.getElementById("__ordinary_test_element__")?.remove());
		}
	});
});
