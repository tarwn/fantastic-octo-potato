import type { Request, Route } from "playwright";
import { describe, expect, it, vi } from "vitest";

import { type BlockedRequestEvent, createAllowListRouteHandler, isAllowedUrl, SAFE_ALLOWED_ORIGINS } from "./allowList.ts";

describe("isAllowedUrl", () => {
	it("allows a URL whose origin exactly matches an allowlist entry", () => {
		expect(isAllowedUrl("https://example.com/path?q=1", ["https://example.com"])).toBe(true);
	});

	it("rejects a URL whose origin merely starts with an allowlist entry's string", () => {
		expect(isAllowedUrl("https://example.com.attacker.com/", ["https://example.com"])).toBe(false);
		expect(isAllowedUrl("https://example.com@attacker.com/", ["https://example.com"])).toBe(false);
	});

	it("rejects a URL whose origin doesn't match any allowlist entry", () => {
		expect(isAllowedUrl("https://other.example.com/", ["https://example.com"])).toBe(false);
	});

	it("matches a bare-scheme allowlist entry (e.g. \"data:\") by protocol, not origin", () => {
		expect(isAllowedUrl("data:text/html,<html></html>", ["data:"])).toBe(true);
		expect(isAllowedUrl("https://example.com/", ["data:"])).toBe(false);
	});

	it("rejects an unparsable URL", () => {
		expect(isAllowedUrl("not a url", ["https://example.com"])).toBe(false);
	});

	it("ignores an unparsable allowlist entry rather than throwing", () => {
		expect(isAllowedUrl("https://example.com/", ["not a url"])).toBe(false);
	});

	it("matches an opaque-origin allowlist entry (e.g. \"about:blank\") by exact href, not origin", () => {
		expect(isAllowedUrl("about:blank", SAFE_ALLOWED_ORIGINS)).toBe(true);
	});

	it("doesn't let an \"about:blank\" allowlist entry allow other opaque-origin schemes", () => {
		expect(isAllowedUrl("javascript:alert(1)", SAFE_ALLOWED_ORIGINS)).toBe(false);
	});
});

function fakeRequest(url: string, isNavigation: boolean): Request {
	return { url: () => url, isNavigationRequest: () => isNavigation } as unknown as Request;
}

function fakeRoute(): Route & { continue: ReturnType<typeof vi.fn>; abort: ReturnType<typeof vi.fn> } {
	return { continue: vi.fn().mockResolvedValue(undefined), abort: vi.fn().mockResolvedValue(undefined) } as unknown as Route & {
		continue: ReturnType<typeof vi.fn>;
		abort: ReturnType<typeof vi.fn>;
	};
}

describe("createAllowListRouteHandler", () => {
	it("continues an allowed request without reporting it as blocked", async () => {
		const onBlocked = vi.fn();
		const handler = createAllowListRouteHandler(["https://example.com"], onBlocked);
		const route = fakeRoute();

		await handler(route, fakeRequest("https://example.com/ok", false));

		expect(route.continue).toHaveBeenCalledOnce();
		expect(route.abort).not.toHaveBeenCalled();
		expect(onBlocked).not.toHaveBeenCalled();
	});

	it("aborts a disallowed request and reports it as blocked, flagging whether it was a navigation", async () => {
		const events: BlockedRequestEvent[] = [];
		const handler = createAllowListRouteHandler(["https://example.com"], (event) => events.push(event));

		await handler(fakeRoute(), fakeRequest("https://blocked.example.net/nav", true));
		await handler(fakeRoute(), fakeRequest("https://blocked.example.net/img.png", false));

		expect(events).toEqual([
			{ url: "https://blocked.example.net/nav", isNavigation: true },
			{ url: "https://blocked.example.net/img.png", isNavigation: false }
		]);
	});

	it("calls route.abort() for a disallowed request", async () => {
		const handler = createAllowListRouteHandler(["https://example.com"], vi.fn());
		const route = fakeRoute();

		await handler(route, fakeRequest("https://blocked.example.net/", false));

		expect(route.abort).toHaveBeenCalledOnce();
		expect(route.continue).not.toHaveBeenCalled();
	});
});
