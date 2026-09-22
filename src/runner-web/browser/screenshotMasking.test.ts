import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { log } from "../logger.ts";

import { closeFixtureBrowser, type FixtureBrowser, openFixturePage } from "./_test/testPage.ts";
import { takeMaskedScreenshot } from "./screenshotMasking.ts";

vi.mock("../logger.ts", () => ({ log: vi.fn() }));

// PNG IHDR width/height live right after the 8-byte signature + 4-byte length + 4-byte "IHDR" tag.
function pngHeight(png: Buffer): number {
	return png.readUInt32BE(20);
}

let fixture: FixtureBrowser;

beforeAll(async () => {
	fixture = await openFixturePage();
});

afterAll(async () => {
	await closeFixtureBrowser(fixture);
});

describe("takeMaskedScreenshot", () => {
	it("captures the full scrollable page, not just the viewport", async () => {
		const result = await takeMaskedScreenshot(fixture.page, 42, []);
		const viewportHeight = fixture.page.viewportSize()?.height ?? 0;
		const documentHeight = await fixture.page.evaluate(() => document.documentElement.scrollHeight);

		expect(documentHeight).toBeGreaterThan(viewportHeight);
		expect(pngHeight(result)).toBe(documentHeight);
	});

	it("masks a sensitive element that sits below the fold", async () => {
		vi.mocked(log).mockClear();
		// #belowFoldInput (value "deep-value") is positioned well outside the viewport in the fixture.
		await takeMaskedScreenshot(fixture.page, 42, ["deep-value"]);

		expect(log).toHaveBeenCalledTimes(1);
		const [message] = vi.mocked(log).mock.calls[0];
		expect(message).toContain("redacting 1 element(s)");
		expect(message).toMatch(/y=19\d\d/);
	});

	it("returns a plain screenshot when there are no secrets to mask", async () => {
		const withoutMasking = await fixture.page.screenshot({ fullPage: true });
		const result = await takeMaskedScreenshot(fixture.page, 42, []);
		expect(result.equals(withoutMasking)).toBe(true);
		expect(log).not.toHaveBeenCalled();
	});

	it("overlays elements whose text or control value matches a known secret, then removes the overlay", async () => {
		const withoutMasking = await fixture.page.screenshot({ fullPage: true });
		const masked = await takeMaskedScreenshot(fixture.page, 42, ["1234.50", "ACCT-1042"]);

		expect(masked.equals(withoutMasking)).toBe(false);
		// The overlay is added and removed within the call — nothing should be left behind on the page.
		expect(await fixture.page.locator("#__dsl_mask_overlay__").count()).toBe(0);
	});

	it("logs the job id and the x,y + dimensions of each masked rect", async () => {
		vi.mocked(log).mockClear();
		await takeMaskedScreenshot(fixture.page, 42, ["1234.50", "ACCT-1042"]);

		expect(log).toHaveBeenCalledTimes(1);
		const [message] = vi.mocked(log).mock.calls[0];
		expect(message).toContain("job 42");
		expect(message).toMatch(/x=-?\d+(\.\d+)? y=-?\d+(\.\d+)? width=\d+(\.\d+)? height=\d+(\.\d+)?/);
	});

	it("masks only the element that directly holds the secret, not ancestor containers whose textContent happens to include it too", async () => {
		vi.mocked(log).mockClear();
		await takeMaskedScreenshot(fixture.page, 42, ["1234.50"]);

		// body/html wrap #balance and so both would fail a naive `el.textContent` check; only the
		// element whose own text is the secret should be masked.
		expect(log).toHaveBeenCalledTimes(1);
		const [message] = vi.mocked(log).mock.calls[0];
		expect(message).toContain("redacting 1 element(s)");
	});

	it("ignores empty-string secrets rather than matching every element", async () => {
		const withoutMasking = await fixture.page.screenshot({ fullPage: true });
		const result = await takeMaskedScreenshot(fixture.page, 42, [""]);
		expect(result.equals(withoutMasking)).toBe(true);
		expect(await fixture.page.locator("#__dsl_mask_overlay__").count()).toBe(0);
	});

	it("masks an element whose text matches a PII pattern even when it isn't a known secret", async () => {
		await fixture.page.evaluate(() => {
			const el = document.createElement("div");
			el.id = "__pii_test_element__";
			el.textContent = "jane.doe@example.com";
			// Prepended (not appended) so it lands within the viewport — the fixture's trailing
			// spacer div pushes anything appended at the end below the fold, out of the screenshot.
			document.body.prepend(el);
		});
		try {
			const withoutMasking = await fixture.page.screenshot({ fullPage: true });
			const masked = await takeMaskedScreenshot(fixture.page, 42, []);

			expect(masked.equals(withoutMasking)).toBe(false);
			expect(await fixture.page.locator("#__dsl_mask_overlay__").count()).toBe(0);
		}
		finally {
			await fixture.page.evaluate(() => document.getElementById("__pii_test_element__")?.remove());
		}
	});

	it("skips the third-party PII pass when skipPiiPass is true, while still masking a known secret", async () => {
		await fixture.page.evaluate(() => {
			const el = document.createElement("div");
			el.id = "__pii_skip_test_element__";
			el.textContent = "jane.doe@example.com";
			document.body.appendChild(el);
		});
		try {
			const withoutMasking = await fixture.page.screenshot({ fullPage: true });
			const masked = await takeMaskedScreenshot(fixture.page, 42, [], true);
			expect(masked.equals(withoutMasking)).toBe(true);

			const maskedKnownSecret = await takeMaskedScreenshot(fixture.page, 42, ["1234.50"], true);
			expect(maskedKnownSecret.equals(withoutMasking)).toBe(false);
		}
		finally {
			await fixture.page.evaluate(() => document.getElementById("__pii_skip_test_element__")?.remove());
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
			const withoutMasking = await fixture.page.screenshot({ fullPage: true });
			const masked = await takeMaskedScreenshot(fixture.page, 42, []);

			expect(masked.equals(withoutMasking)).toBe(true);
			expect(await fixture.page.locator("#__dsl_mask_overlay__").count()).toBe(0);
		}
		finally {
			await fixture.page.evaluate(() => document.getElementById("__ordinary_test_element__")?.remove());
		}
	});
});
