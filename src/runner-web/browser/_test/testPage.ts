import { type Browser, chromium, type Page } from "playwright";

import { FIXTURE_HTML } from "./fixturePage.ts";

// Shared per-test-file browser/page setup for the fixture page above — real Chromium, no jsdom,
// since the DSL driver these tests exercise talks to Playwright directly.
export interface FixtureBrowser {
	browser: Browser;
	page: Page;
}

export async function openFixturePage(): Promise<FixtureBrowser> {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
	await page.setContent(FIXTURE_HTML);
	return { browser, page };
}

export async function closeFixtureBrowser(fixture: FixtureBrowser): Promise<void> {
	await fixture.browser.close();
}
