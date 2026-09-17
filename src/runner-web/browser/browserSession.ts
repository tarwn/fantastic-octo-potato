import { type Browser, type BrowserContext, chromium, type Page, type Request, type Route } from "playwright";

// A dedicated browser/context/page for exactly one Job — Trial and Execute both get a fresh
// session per Job, closed on every terminal exit path.
export interface BrowserSession {
	browser: Browser;
	context: BrowserContext;
	page: Page;
}

export type RouteHandler = (route: Route, request: Request) => Promise<void>;

// `routeHandler`, when given, is registered on the context so every request (navigation or
// subresource) passes through it before Playwright sends it — what's allowed and what happens to a
// blocked request is a policy decision made by the caller (see allowList.ts), not this module.
export async function launchBrowserSession(routeHandler?: RouteHandler): Promise<BrowserSession> {
	const browser = await chromium.launch();
	const context = await browser.newContext();
	if (routeHandler) {
		await context.route("**/*", routeHandler);
	}
	const page = await context.newPage();
	return { browser, context, page };
}

export async function closeBrowserSession(session: BrowserSession): Promise<void> {
	await session.context.close();
	await session.browser.close();
}
