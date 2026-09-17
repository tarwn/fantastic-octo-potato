import { type Browser, type BrowserContext, chromium, type Page } from "playwright";

// A dedicated browser/context/page for exactly one Job — Trial and Execute both get a fresh
// session per Job, closed on every terminal exit path.
export interface BrowserSession {
	browser: Browser;
	context: BrowserContext;
	page: Page;
}

export async function launchBrowserSession(): Promise<BrowserSession> {
	const browser = await chromium.launch();
	const context = await browser.newContext();
	const page = await context.newPage();
	return { browser, context, page };
}

export async function closeBrowserSession(session: BrowserSession): Promise<void> {
	await session.context.close();
	await session.browser.close();
}
