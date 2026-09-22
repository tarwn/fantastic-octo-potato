import type { ElementHandle, Locator, Page } from "playwright";

import type { ExecutionContext } from "../dsl/executionContext.ts";
import type { Target, TargetElement, TargetPoint } from "../dsl/types.ts";
import { resolveStringValue } from "../dsl/valueResolver.ts";

// Actions that operate on a single element need exactly one match — missing and ambiguous (2+
// matches) are distinct, reported outcomes, never a silent first-match pick.
export type TargetResolution = { status: "found"; locator: Locator } | { status: "missing" } | { status: "ambiguous"; count: number };

export type ResolvedTargetElement = { by: TargetElement["by"]; value: string; exact?: boolean };

// A ref'd value may be a sensitive input, so the resolved value must only reach a locator —
// callers that put it in a message redact it against ctx.secrets first.
export function resolveTargetValue(target: TargetElement, ctx: ExecutionContext): ResolvedTargetElement {
	const value = resolveStringValue(target.value, ctx);
	return target.by === "text" && target.exact !== undefined ? { by: target.by, value, exact: target.exact } : { by: target.by, value };
}

export function isPointTarget(target: Target): target is TargetPoint {
	return target.by === "point";
}

// Forms commonly render labels as "Email:" while a model reads them as "Email", so a label matches
// whole-text ignoring case, surrounding whitespace and a trailing colon — never as a substring,
// which would make "Password" ambiguous with "Confirm password".
function labelPattern(value: string): RegExp {
	const bare = value.trim().replace(/\s*:$/, "");
	return new RegExp(`^\\s*${bare.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:?\\s*$`, "i");
}

function toLocator(page: Page, target: ResolvedTargetElement): Locator {
	switch (target.by) {
		case "text":
			// getByText matches DOM text regardless of rendering, so hidden <option>s (e.g. a
			// client-filter <select>) collide with visible text elsewhere on the page.
			return page.getByText(target.value, { exact: target.exact ?? true }).filter({ visible: true });
		case "label":
			return page.getByLabel(labelPattern(target.value));
		case "placeholder":
			return page.getByPlaceholder(target.value, { exact: true });
		case "css":
			return page.locator(target.value);
	}
}

export async function resolveElementTarget(page: Page, target: ResolvedTargetElement): Promise<TargetResolution> {
	const locator = toLocator(page, target);
	const count = await locator.count();
	if (count === 0) {
		return { status: "missing" };
	}
	if (count > 1) {
		return { status: "ambiguous", count };
	}
	return { status: "found", locator: locator.first() };
}

export interface ViewportPoint {
	viewportX: number;
	viewportY: number;
}

// Point x/y are full-page screenshot coordinates, not viewport coordinates — scroll the point
// into the middle of the viewport, then translate to viewport-relative coordinates Playwright's
// mouse/DOM APIs expect.
export async function resolveViewportPoint(page: Page, point: TargetPoint): Promise<ViewportPoint> {
	await page.evaluate((y: number) => window.scrollTo(0, Math.max(0, y - window.innerHeight / 2)), point.y);
	const scrollY = await page.evaluate(() => window.scrollY);
	return { viewportX: point.x, viewportY: point.y - scrollY };
}

// Resolves the HTML element at a full-page point for `read`'s point target. A point that lands on
// a canvas or other element with no HTML value to read is out of scope for this POC.
export async function resolveElementAtPoint(page: Page, point: TargetPoint): Promise<ElementHandle<Element> | undefined> {
	const { viewportX, viewportY } = await resolveViewportPoint(page, point);
	const handle = await page.evaluateHandle(
		(args: { x: number; y: number }) => document.elementFromPoint(args.x, args.y),
		{ x: viewportX, y: viewportY }
	);
	const element = handle.asElement();
	return element ?? undefined;
}
