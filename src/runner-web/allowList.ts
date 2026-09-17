import type { Request, Route } from "playwright";

// Emitted whenever a request is aborted for landing outside the Job's allowedOrigins — the
// orchestrator decides what each kind means for the Job's outcome (a blocked navigation is a hard
// stop; a blocked subresource is just worth telling a human about).
export interface BlockedRequestEvent {
	url: string;
	isNavigation: boolean;
}

const SCHEME_ONLY_PATTERN = /^[a-z][a-z0-9+.-]*:$/i;

// Compares by parsed origin, not raw string prefix — a plain prefix match would also let
// "https://example.com.attacker.com" or "https://example.com@attacker.com" through for an
// allowlist entry of "https://example.com". A bare scheme entry (e.g. "data:") is a special case
// for opaque-origin schemes that have no real origin to compare, matched by scheme instead.
export function isAllowedUrl(url: string, allowedOrigins: string[]): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	}
	catch {
		return false;
	}
	return allowedOrigins.some((allowed) => {
		if (SCHEME_ONLY_PATTERN.test(allowed)) {
			return parsed.protocol === allowed;
		}
		try {
			return parsed.origin === new URL(allowed).origin;
		}
		catch {
			return false;
		}
	});
}

// Registered once per browser session (context.route('**/*', handler)) so a disallowed request
// never leaves the browser, rather than being discovered after the fact by inspecting where the
// page ended up. Playwright's request interception has no visibility into non-network navigations
// (data:/about:/blob:) — callers still need a post-hoc `isAllowedUrl(page.url(), ...)` check as a
// backstop for those; this only covers requests that actually reach the network stack.
export function createAllowListRouteHandler(allowedOrigins: string[], onBlocked: (event: BlockedRequestEvent) => void): (route: Route, request: Request) => Promise<void> {
	return async (route, request) => {
		if (isAllowedUrl(request.url(), allowedOrigins)) {
			await route.continue();
			return;
		}
		onBlocked({ url: request.url(), isNavigation: request.isNavigationRequest() });
		await route.abort();
	};
}
