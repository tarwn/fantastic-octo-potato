import { describe, expect, it, vi } from "vitest";

import { closeBrowserSession, launchBrowserSession } from "./browserSession.ts";

describe("browserSession", () => {
	it("launches a browser/context/page and closes them all", async () => {
		const session = await launchBrowserSession();
		try {
			expect(session.browser.isConnected()).toBe(true);
			expect(session.page.isClosed()).toBe(false);
		}
		finally {
			await closeBrowserSession(session);
		}
		expect(session.browser.isConnected()).toBe(false);
	});

	it("routes every outgoing request through a given handler when one is provided", async () => {
		const handler = vi.fn(async (route: { abort: () => Promise<void> }) => route.abort());
		const session = await launchBrowserSession(handler);
		try {
			const result = await session.page.evaluate(() =>
				fetch("https://blocked.example.invalid/ping")
					.then(() => "ok")
					.catch(() => "blocked")
			);
			expect(result).toBe("blocked");
			expect(handler).toHaveBeenCalled();
		}
		finally {
			await closeBrowserSession(session);
		}
	});

	it("does not register a route handler when none is given", async () => {
		const session = await launchBrowserSession();
		try {
			expect(session.page.isClosed()).toBe(false);
		}
		finally {
			await closeBrowserSession(session);
		}
	});
});
