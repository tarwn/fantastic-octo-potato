import { describe, expect, it } from "vitest";

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
});
